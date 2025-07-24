// components/ProfileImageUpload.js - S3 연동 버전
import { Avatar, Button, Callout, IconButton } from '@vapor-ui/core';
import {
  ErrorCircleIcon as AlertCircle,
  CameraIcon,
  LoadingOutlineIcon as Loader,
  TrashOutlineIcon as Trash
} from '@vapor-ui/icons';
import { useCallback, useRef, useState } from 'react';
import authService from '../services/authService';
import fileService from '../services/fileService';
import { Box, Stack } from './ui/Layout';

const ProfileImageUpload = ({
  currentImageUrl = '',
  onImageChange,
  size = 'lg',
  disabled = false,
  allowDelete = true,
  userId
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl);
  const fileInputRef = useRef(null);

  // 파일 선택 핸들러
  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      // 파일 유효성 검사
      await fileService.validateFile(file);

      // 이미지 파일인지 확인
      if (!file.type.startsWith('image/')) {
        throw new Error('이미지 파일만 업로드할 수 있습니다.');
      }

      // 로컬 미리보기 생성
      const localPreviewUrl = fileService.createPreviewUrl(file);
      setPreviewUrl(localPreviewUrl);

      console.log('Starting profile image upload:', {
        fileName: file.name,
        fileSize: fileService.formatFileSize(file.size),
        fileType: file.type
      });

      // S3에 업로드
      const uploadResult = await fileService.uploadProfileImage(
        file,
        userId || authService.getCurrentUser()?.id,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      console.log('Profile image upload completed:', uploadResult);

      // 업로드 성공 시 부모 컴포넌트에 알림
      if (onImageChange) {
        onImageChange(uploadResult.url);
      }

      // 로컬 미리보기 URL 정리
      if (localPreviewUrl !== uploadResult.url) {
        fileService.revokePreviewUrl(localPreviewUrl);
      }

      // 실제 S3 URL로 미리보기 업데이트
      setPreviewUrl(uploadResult.url);

    } catch (error) {
      console.error('Profile image upload error:', error);
      setError(error.message || '이미지 업로드에 실패했습니다.');

      // 에러 시 이전 이미지로 복원
      setPreviewUrl(currentImageUrl);

      // 로컬 미리보기 URL 정리
      const localPreview = fileService.createPreviewUrl(file);
      if (localPreview) {
        fileService.revokePreviewUrl(localPreview);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);

      // 파일 입력 필드 리셋
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [currentImageUrl, onImageChange, userId]);

  // 이미지 삭제 핸들러
  const handleImageDelete = useCallback(async () => {
    if (!previewUrl || !allowDelete || uploading) return;

    const confirmDelete = window.confirm('프로필 이미지를 삭제하시겠습니까?');
    if (!confirmDelete) return;

    setError('');
    setUploading(true);

    try {
      // S3에서 이미지 삭제
      if (previewUrl !== currentImageUrl) {
        await fileService.deleteFile(previewUrl);
      }

      // 미리보기 초기화
      setPreviewUrl('');

      // 부모 컴포넌트에 삭제 알림
      if (onImageChange) {
        onImageChange('');
      }

      console.log('Profile image deleted successfully');

    } catch (error) {
      console.error('Profile image deletion error:', error);
      setError('이미지 삭제에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }, [previewUrl, currentImageUrl, allowDelete, uploading, onImageChange]);

  // 파일 입력 클릭 트리거
  const triggerFileInput = useCallback(() => {
    if (!disabled && !uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, uploading]);

  // 드래그 앤 드롭 핸들러
  const handleDrop = useCallback(async (event) => {
    event.preventDefault();

    if (disabled || uploading) return;

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];

      // 파일 입력에 설정 (handleFileSelect가 호출됨)
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileSelect({ target: { files: dataTransfer.files } });
      }
    }
  }, [disabled, uploading, handleFileSelect]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  // 아바타 사이즈 설정
  const avatarSize = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
    xl: 'w-40 h-40'
  }[size] || 'w-32 h-32';

  // 업로드 진행률 렌더링
  const renderProgress = () => {
    if (!uploading) return null;

    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span>업로드 중...</span>
          <span>{uploadProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>
    );
  };

  // 에러 메시지 렌더링
  const renderError = () => {
    if (!error) return null;

    return (
      <Callout color="danger" className="mt-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      </Callout>
    );
  };

  return (
    <Stack spacing="md" className="profile-image-upload">
      {/* 아바타 미리보기 영역 */}
      <Box className="relative inline-block">
        <div
          className={`${avatarSize} relative cursor-pointer group transition-all duration-200 hover:opacity-80`}
          onClick={triggerFileInput}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          role="button"
          tabIndex={0}
          aria-label="프로필 이미지 업로드"
        >
          <Avatar
            src={previewUrl}
            size={size}
            className="w-full h-full"
            alt="프로필 이미지"
          />

          {/* 오버레이 */}
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-full flex items-center justify-center">
            {uploading ? (
              <Loader className="w-6 h-6 text-white animate-spin" />
            ) : (
              <CameraIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            )}
          </div>
        </div>

        {/* 삭제 버튼 */}
        {allowDelete && previewUrl && !uploading && (
          <IconButton
            size="sm"
            variant="outline"
            onClick={handleImageDelete}
            className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white border-red-500"
            title="이미지 삭제"
            aria-label="프로필 이미지 삭제"
          >
            <Trash className="w-3 h-3" />
          </IconButton>
        )}
      </Box>

      {/* 파일 입력 (숨김) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={disabled || uploading}
        className="hidden"
        aria-hidden="true"
      />

      {/* 업로드 버튼 */}
      <div className="flex gap-2">
        <Button
          onClick={triggerFileInput}
          disabled={disabled || uploading}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          {uploading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              업로드 중...
            </>
          ) : (
            <>
              <CameraIcon className="w-4 h-4" />
              이미지 선택
            </>
          )}
        </Button>
      </div>

      {/* 진행률 표시 */}
      {renderProgress()}

      {/* 에러 메시지 */}
      {renderError()}

      {/* 도움말 텍스트 */}
      <div className="text-xs text-gray-500">
        <p>JPG, PNG, GIF, WebP 형식 지원</p>
        <p>최대 파일 크기: 10MB</p>
        <p>드래그 앤 드롭으로도 업로드 가능</p>
      </div>
    </Stack>
  );
};

export default ProfileImageUpload;