// pages/profile.js - S3 직접 업로드 + 백엔드 삭제 버전
import { Button, Callout, Card, Text } from '@vapor-ui/core';
import { ErrorCircleIcon } from '@vapor-ui/icons';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { withAuth } from '../middleware/withAuth';
import authService from '../services/authService';
import fileService from '../services/fileService';
import { generateColorFromEmail, getContrastTextColor } from '../utils/colorUtils';

const Profile = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [profileImage, setProfileImage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const router = useRouter();
  const avatarStyleRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        router.push('/');
        return;
      }

      // 아바타 스타일과 함께 사용자 정보 설정
      if (!avatarStyleRef.current && user.email) {
        const backgroundColor = generateColorFromEmail(user.email);
        const color = getContrastTextColor(backgroundColor);
        avatarStyleRef.current = { backgroundColor, color };
      }

      setCurrentUser(user);
      setFormData(prev => ({ ...prev, name: user.name }));
      setProfileImage(user.profileImage || '');
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('사용자 정보를 불러오는데 실패했습니다.');
    }
  }, [router]);

  // 전역 이벤트 리스너 설정
  useEffect(() => {
    const handleProfileUpdate = () => {
      try {
        const user = authService.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          setProfileImage(user.profileImage || '');
        }
      } catch (err) {
        console.error('Error updating profile:', err);
      }
    };

    window.addEventListener('userProfileUpdate', handleProfileUpdate);
    return () => {
      window.removeEventListener('userProfileUpdate', handleProfileUpdate);
    };
  }, []);

  // 이미지 리사이징 함수
  const resizeImage = (file, maxWidth = 400, maxHeight = 400, quality = 0.8) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // 비율 계산
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // 이미지 그리기
        ctx.drawImage(img, 0, 0, width, height);

        // Blob으로 변환
        canvas.toBlob((blob) => {
          resolve(blob);
        }, file.type, quality);
      };

      img.src = URL.createObjectURL(file);
    });
  };

  // S3 직접 업로드 핸들러
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImageUploading(true);
    setError('');

    try {
      // fileService를 사용해 파일 유효성 검사
      await fileService.validateFile(file);

      // 이미지 파일만 허용 (프로필 이미지용)
      if (!file.type.startsWith('image/')) {
        throw new Error('이미지 파일만 업로드 가능합니다.');
      }

      console.log('원본 이미지 크기:', file.size, 'bytes');

      // 이미지 리사이징 (400x400 최대, 80% 품질)
      const resizedBlob = await resizeImage(file, 400, 400, 0.8);
      const resizedFile = new File([resizedBlob], file.name, { type: file.type });

      console.log('리사이징 후 크기:', resizedFile.size, 'bytes');

      // 임시 미리보기 URL 생성 (리사이징된 이미지로)
      const tempUrl = fileService.createPreviewUrl(resizedFile);
      if (tempUrl) {
        setProfileImage(tempUrl);
      }

      console.log('프로필 이미지 업로드 시작:', resizedFile.name);

      // S3에 리사이징된 이미지 업로드
      const uploadResult = await fileService.uploadFile(
        resizedFile,
        `profile/${currentUser.id}`, // 사용자별 프로필 폴더
        (progress) => {
          console.log(`업로드 진행률: ${progress}%`);
        }
      );

      console.log('S3 업로드 완료:', uploadResult);

      // 실제 S3 URL로 업데이트
      setProfileImage(uploadResult.url);

      // 사용자 정보 업데이트 (S3 URL로)
      const updatedUser = {
        ...currentUser,
        profileImage: uploadResult.url
      };

      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);

      // 백엔드에 S3 URL 저장 - 별도 API 사용
      try {
        // updateProfileImageUrl이라는 새로운 메서드 사용
        const user = authService.getCurrentUser();
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': user.token,
            'x-session-id': user.sessionId
          },
          body: JSON.stringify({
            name: currentUser.name, // 기존 이름 유지
            profileImage: uploadResult.url
          })
        });

        if (!response.ok) {
          throw new Error('프로필 이미지 URL 저장 실패');
        }

        console.log('백엔드에 프로필 이미지 URL 저장 완료');
      } catch (apiError) {
        console.warn('백엔드 프로필 이미지 URL 저장 실패:', apiError);
        // 백엔드 실패해도 프론트엔드는 S3 URL 사용 계속
      }

      // 임시 미리보기 URL 해제
      if (tempUrl) {
        fileService.revokePreviewUrl(tempUrl);
      }

      setSuccess('프로필 이미지가 업데이트되었습니다.');
      setTimeout(() => setSuccess(''), 3000);

      // 전역 이벤트 발생
      window.dispatchEvent(new Event('userProfileUpdate'));

    } catch (err) {
      console.error('프로필 이미지 업로드 에러:', err);
      setError(err.message || '프로필 이미지 업로드에 실패했습니다.');

      // 실패 시 원래 이미지로 되돌리기
      setProfileImage(currentUser.profileImage || '');

      setTimeout(() => setError(''), 5000);
    } finally {
      setIsImageUploading(false);
      // 파일 input 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 백엔드 이미지 삭제 핸들러
  const handleImageDelete = async () => {
    if (!profileImage) return;

    const confirmDelete = window.confirm('프로필 이미지를 삭제하시겠습니까?');
    if (!confirmDelete) return;

    setIsImageUploading(true);
    setError('');

    try {
      console.log('프로필 이미지 삭제 시작:', profileImage);

      // 먼저 UI에서 이미지 제거 (즉시 반응)
      setProfileImage('');

      // 백엔드 deleteProfileImage 엔드포인트 호출 (DELETE /api/users/profile-image)
      const result = await authService.deleteProfileImage();
      console.log('삭제 API 응답:', result);

      // 사용자 정보 업데이트
      const updatedUser = {
        ...currentUser,
        profileImage: ''
      };

      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);

      setSuccess('프로필 이미지가 삭제되었습니다.');
      setTimeout(() => setSuccess(''), 3000);

      // 전역 이벤트 발생
      window.dispatchEvent(new Event('userProfileUpdate'));

      console.log('프로필 이미지 삭제 완료');

    } catch (err) {
      console.error('프로필 이미지 삭제 에러:', err);
      console.error('에러 스택:', err.stack);

      // 삭제 실패 시 원래 이미지로 복원
      setProfileImage(currentUser.profileImage || '');

      // 더 구체적인 에러 메시지
      let errorMessage = '프로필 이미지 삭제에 실패했습니다.';
      if (err.message.includes('404')) {
        errorMessage = '삭제할 이미지를 찾을 수 없습니다.';
      } else if (err.message.includes('401')) {
        errorMessage = '로그인이 필요합니다.';
      } else if (err.message.includes('네트워크')) {
        errorMessage = '네트워크 연결을 확인해주세요.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsImageUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.newPassword !== formData.confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);

    try {
      // 비밀번호 변경 처리
      if (formData.currentPassword) {
        if (!formData.newPassword) {
          throw new Error('새 비밀번호를 입력해주세요.');
        }
        await authService.changePassword(formData.currentPassword, formData.newPassword);
      }

      // 이름 변경 처리
      if (formData.name !== currentUser.name) {
        const updatedUser = await authService.updateProfile({ name: formData.name });
        setCurrentUser(updatedUser);
      }

      setSuccess('프로필이 성공적으로 업데이트되었습니다.');

      // 비밀번호 필드 초기화
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));

      // 전역 이벤트 발생
      window.dispatchEvent(new Event('userProfileUpdate'));

    } catch (err) {
      console.error('Profile update error:', err);
      setError(err.response?.data?.message || err.message || '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 아바타 컴포넌트
  const Avatar = ({ size = "lg", imageUrl, email }) => {
    const sizeClasses = {
      sm: "w-8 h-8 text-xs",
      md: "w-12 h-12 text-sm",
      lg: "w-16 h-16 text-base",
      xl: "w-20 h-20 text-lg",
      "2xl": "w-24 h-24 text-xl"
    };

    if (imageUrl) {
      return (
        <div
          className={`${sizeClasses[size]} rounded-full overflow-hidden border-2 border-gray-200 shadow-md flex-shrink-0`}
          style={{
            width: size === 'lg' ? '64px' : '80px',
            height: size === 'lg' ? '64px' : '80px',
            minWidth: size === 'lg' ? '64px' : '80px',
            minHeight: size === 'lg' ? '64px' : '80px',
            maxWidth: size === 'lg' ? '64px' : '80px',
            maxHeight: size === 'lg' ? '64px' : '80px'
          }}
        >
          <img
            src={imageUrl}
            alt="프로필"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }}
          />
        </div>
      );
    }

    const backgroundColor = generateColorFromEmail(email || '');
    const color = getContrastTextColor(backgroundColor);
    const initials = email ? email.charAt(0).toUpperCase() : 'U';

    return (
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold border-2 border-gray-200 shadow-md`}
        style={{ backgroundColor, color }}
      >
        {initials}
      </div>
    );
  };

  if (!currentUser) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Text>로딩 중...</Text>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Card.Root 사용 - Vapor UI 올바른 방법 */}
        <Card.Root className="p-8">
          <div className="space-y-6">
            {/* 헤더 */}
            <div className="text-center">
              <Text size="2xl" weight="bold" className="mb-2">
                프로필 설정
              </Text>
              <Text size="sm" color="gray">
                프로필 정보를 수정할 수 있습니다.
              </Text>
            </div>

            {/* 프로필 이미지 업로드 */}
            <div className="flex flex-col items-center">
              <Text size="lg" weight="semibold" className="mb-4">
                프로필 이미지
              </Text>

              <div className="relative">
                <Avatar
                  size="lg"
                  imageUrl={profileImage}
                  email={currentUser.email}
                />

                {isImageUploading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImageUploading}
                  className="text-xs"
                >
                  {isImageUploading ? '업로드 중...' : '이미지 변경'}
                </Button>

                {profileImage && !profileImage.startsWith('blob:') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImageDelete}
                    disabled={isImageUploading}
                    className="text-xs text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    삭제
                  </Button>
                )}
              </div>

              <Text size="xs" color="gray" className="mt-2 text-center">
                JPG, PNG, GIF, WebP 파일 (최대 {fileService.formatFileSize(fileService.maxFileSize)})
              </Text>
            </div>

            {/* 프로필 정보 폼 */}
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Text size="lg" weight="semibold" className="mb-4">
                    기본 정보
                  </Text>

                  <div className="space-y-4">
                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        이메일
                      </Text>
                      <input
                        type="email"
                        value={currentUser.email}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                      <Text size="xs" color="gray" className="mt-1">
                        이메일은 변경할 수 없습니다.
                      </Text>
                    </div>

                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        이름
                      </Text>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="이름을 입력하세요"
                        disabled={loading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {/* 비밀번호 변경 */}
                <div>
                  <Text size="lg" weight="semibold" className="mb-4">
                    비밀번호 변경
                  </Text>

                  <div className="space-y-4">
                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        현재 비밀번호
                      </Text>
                      <input
                        type="password"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleInputChange}
                        placeholder="현재 비밀번호를 입력하세요"
                        disabled={loading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        새 비밀번호
                      </Text>
                      <input
                        type="password"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleInputChange}
                        placeholder="새 비밀번호를 입력하세요"
                        disabled={loading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        새 비밀번호 확인
                      </Text>
                      <input
                        type="password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        placeholder="새 비밀번호를 다시 입력하세요"
                        disabled={loading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {/* 에러/성공 메시지 */}
                {error && (
                  <Callout color="danger">
                    <div className="flex items-center gap-2">
                      <ErrorCircleIcon className="w-5 h-5" />
                      <span>{error}</span>
                    </div>
                  </Callout>
                )}

                {success && (
                  <Callout color="success">
                    <span>{success}</span>
                  </Callout>
                )}

                {/* 버튼 */}
                <div className="flex justify-between items-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => router.push('/chat-rooms')}
                    disabled={loading}
                  >
                    취소
                  </Button>

                  <Button
                    type="submit"
                    loading={loading}
                    disabled={loading}
                  >
                    {loading ? '저장 중...' : '변경 사항 저장'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </Card.Root>
      </div>
    </div>
  );
};

export default withAuth(Profile);