// services/fileService.js - S3 연동 버전
import s3Service from './s3Service';

class FileService {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    this.allowedVideoTypes = ['video/mp4', 'video/webm', 'video/avi', 'video/mov'];
    this.allowedAudioTypes = ['audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg'];
    this.allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  }

  /**
   * 파일 유효성 검사
   */
  async validateFile(file) {
    if (!file) {
      throw new Error('파일이 선택되지 않았습니다.');
    }

    // 파일 크기 검사
    if (file.size > this.maxFileSize) {
      throw new Error(`파일 크기는 ${this.formatFileSize(this.maxFileSize)}를 초과할 수 없습니다.`);
    }

    // 파일 타입 검사
    const allAllowedTypes = [
      ...this.allowedImageTypes,
      ...this.allowedVideoTypes,
      ...this.allowedAudioTypes,
      ...this.allowedDocumentTypes
    ];

    if (!allAllowedTypes.includes(file.type)) {
      throw new Error('지원하지 않는 파일 형식입니다.');
    }

    return true;
  }

  /**
   * 단일 파일 업로드
   * @param {File} file - 업로드할 파일
   * @param {string} folder - 업로드 폴더 ('profile-images', 'chat-files', 'documents' 등)
   * @param {Function} onProgress - 업로드 진행률 콜백
   * @returns {Promise<Object>} 업로드 결과 객체
   */
  async uploadFile(file, folder = 'uploads', onProgress = null) {
    try {
      // 파일 유효성 검사
      await this.validateFile(file);

      console.log(`Uploading file to S3: ${file.name} (${this.formatFileSize(file.size)})`);

      // S3에 업로드
      const s3Url = await s3Service.uploadFile(file, folder, onProgress);

      // 업로드 결과 반환
      const result = {
        success: true,
        url: s3Url,
        originalName: file.name,
        size: file.size,
        type: file.type,
        folder: folder,
        uploadedAt: new Date().toISOString()
      };

      console.log('File uploaded successfully:', result);
      return result;

    } catch (error) {
      console.error('File upload error:', error);
      throw new Error(error.message || '파일 업로드에 실패했습니다.');
    }
  }

  /**
   * 여러 파일 업로드
   * @param {FileList|File[]} files - 업로드할 파일들
   * @param {string} folder - 업로드 폴더
   * @param {Function} onProgress - 전체 진행률 콜백
   * @returns {Promise<Object[]>} 업로드 결과 배열
   */
  async uploadMultipleFiles(files, folder = 'uploads', onProgress = null) {
    try {
      const fileArray = Array.from(files);

      // 모든 파일 유효성 검사
      for (const file of fileArray) {
        await this.validateFile(file);
      }

      console.log(`Uploading ${fileArray.length} files to S3`);

      // S3에 업로드
      const s3Urls = await s3Service.uploadMultipleFiles(fileArray, folder, onProgress);

      // 결과 객체 생성
      const results = fileArray.map((file, index) => ({
        success: true,
        url: s3Urls[index],
        originalName: file.name,
        size: file.size,
        type: file.type,
        folder: folder,
        uploadedAt: new Date().toISOString()
      }));

      console.log('Multiple files uploaded successfully:', results);
      return results;

    } catch (error) {
      console.error('Multiple files upload error:', error);
      throw new Error(error.message || '파일 업로드에 실패했습니다.');
    }
  }

  /**
   * 프로필 이미지 업로드 (특화 메서드)
   * @param {File} imageFile - 이미지 파일
   * @param {string} userId - 사용자 ID
   * @param {Function} onProgress - 진행률 콜백
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadProfileImage(imageFile, userId, onProgress = null) {
    try {
      // 이미지 파일 검증
      if (!this.allowedImageTypes.includes(imageFile.type)) {
        throw new Error('프로필 이미지는 JPG, PNG, GIF, WebP 형식만 지원합니다.');
      }

      // 프로필 이미지 폴더에 업로드
      const result = await this.uploadFile(imageFile, 'profile-images', onProgress);

      // 추가 메타데이터
      result.userId = userId;
      result.isProfileImage = true;

      return result;

    } catch (error) {
      console.error('Profile image upload error:', error);
      throw error;
    }
  }

  /**
   * 채팅 파일 업로드 (특화 메서드)
   * @param {File} file - 업로드할 파일
   * @param {string} chatRoomId - 채팅방 ID
   * @param {Function} onProgress - 진행률 콜백
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadChatFile(file, chatRoomId, onProgress = null) {
    try {
      // 채팅 파일 폴더에 업로드
      const result = await this.uploadFile(file, `chat-files/${chatRoomId}`, onProgress);

      // 추가 메타데이터
      result.chatRoomId = chatRoomId;
      result.isChatFile = true;

      return result;

    } catch (error) {
      console.error('Chat file upload error:', error);
      throw error;
    }
  }

  /**
   * 파일 삭제
   * @param {string} fileUrl - 삭제할 파일의 S3 URL
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileUrl) {
    try {
      const result = await s3Service.deleteFile(fileUrl);
      console.log('File deleted successfully:', fileUrl);
      return result;
    } catch (error) {
      console.error('File deletion error:', error);
      throw new Error('파일 삭제에 실패했습니다.');
    }
  }

  /**
   * 파일 크기 포맷팅
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 파일 타입 확인
   */
  getFileCategory(fileType) {
    if (this.allowedImageTypes.includes(fileType)) return 'image';
    if (this.allowedVideoTypes.includes(fileType)) return 'video';
    if (this.allowedAudioTypes.includes(fileType)) return 'audio';
    if (this.allowedDocumentTypes.includes(fileType)) return 'document';
    return 'unknown';
  }

  /**
   * 이미지 썸네일 URL 생성
   * @param {string} imageUrl - 원본 이미지 URL
   * @param {Object} options - 리사이징 옵션
   * @returns {string} 썸네일 URL
   */
  getThumbnailUrl(imageUrl, options = { width: 150, height: 150, quality: 80 }) {
    // imageUrl이 문자열이 아니거나 빈 값인 경우 원본 반환
    if (!imageUrl || typeof imageUrl !== 'string') {
      return imageUrl;
    }

    if (!this.isImageUrl(imageUrl)) {
      return imageUrl;
    }

    try {
      return s3Service.getResizedImageUrl(imageUrl, options);
    } catch (error) {
      console.warn('getThumbnailUrl error:', error, 'imageUrl:', imageUrl);
      return imageUrl;
    }
  }

  /**
   * URL이 이미지인지 확인
   */
  isImageUrl(url) {
    // url이 문자열이 아니거나 빈 값인 경우 false 반환
    if (!url || typeof url !== 'string') return false;

    try {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const urlLower = url.toLowerCase();
      return imageExtensions.some(ext => urlLower.includes(ext));
    } catch (error) {
      console.warn('isImageUrl error:', error, 'url:', url);
      return false;
    }
  }

  /**
   * 이미지 미리보기 URL 생성 (브라우저용)
   * @param {File} file - 이미지 파일
   * @returns {string|null} Object URL 또는 null
   */
  createPreviewUrl(file) {
    if (!file || typeof file !== 'object' || !file.type) {
      return null;
    }

    if (!file.type.startsWith('image/')) {
      return null;
    }

    try {
      return URL.createObjectURL(file);
    } catch (error) {
      console.warn('createPreviewUrl error:', error, 'file:', file);
      return null;
    }
  }

  /**
   * Object URL 해제
   * @param {string} url - 해제할 Object URL
   */
  revokePreviewUrl(url) {
    if (!url || typeof url !== 'string') {
      return;
    }

    if (url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('revokePreviewUrl error:', error, 'url:', url);
      }
    }
  }

  /**
   * S3 연결 상태 확인
   */
  async checkS3Connection() {
    try {
      // 간단한 리스트 요청으로 연결 확인
      await s3Service.s3.listObjectsV2({
        Bucket: s3Service.bucketName,
        MaxKeys: 1
      }).promise();

      return true;
    } catch (error) {
      console.error('S3 connection check failed:', error);
      return false;
    }
  }
}

// 싱글톤 인스턴스 생성
const fileService = new FileService();
export default fileService;