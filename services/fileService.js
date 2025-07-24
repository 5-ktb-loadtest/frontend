// services/fileService.js - 개선된 버전
import authService from './authService';
import s3Service from './s3Service';

class FileService {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    this.allowedVideoTypes = ['video/mp4', 'video/webm', 'video/avi', 'video/mov'];
    this.allowedAudioTypes = ['audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg'];
    this.allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    // S3 설정
    this.bucketUrl = process.env.NEXT_PUBLIC_S3_BUCKET_URL ||
      `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_S3_REGION}.amazonaws.com`;
    this.apiUrl = process.env.NEXT_PUBLIC_API_URL;
  }

  /**
   * 파일 경로 생성 - 중앙집중화
   * @param {Object|string} fileInfo - 파일 정보 객체 또는 파일명
   * @param {string} roomId - 채팅방 ID (선택사항)
   * @returns {string} 정규화된 파일 경로
   */
  _buildFilePath(fileInfo, roomId = null) {
    // 1. 파일 객체에서 경로 추출
    if (fileInfo && typeof fileInfo === 'object') {
      // folder와 filename이 모두 있는 경우
      if (fileInfo.folder && fileInfo.filename) {
        return `${fileInfo.folder}/${fileInfo.filename}`;
      }

      // filename만 있고 roomId가 제공된 경우 (채팅 파일)
      if (fileInfo.filename && roomId) {
        return `chat-files/${roomId}/${fileInfo.filename}`;
      }

      // filename만 있는 경우
      if (fileInfo.filename) {
        return fileInfo.filename;
      }
    }

    // 2. 문자열 경로 처리
    if (typeof fileInfo === 'string') {
      // 이미 전체 경로인 경우
      if (fileInfo.includes('/')) {
        return fileInfo;
      }

      // 파일명만 있고 roomId가 제공된 경우
      if (roomId) {
        return `chat-files/${roomId}/${fileInfo}`;
      }

      return fileInfo;
    }

    console.warn('_buildFilePath: Invalid fileInfo', fileInfo);
    return '';
  }

  /**
   * 인증된 URL 생성
   * @param {string} basePath - 기본 파일 경로
   * @param {Object} options - URL 옵션
   * @returns {string} 인증된 URL
   */
  _buildAuthenticatedUrl(basePath, options = {}) {
    const {
      download = false,
      includeAuth = true,
      baseUrl = null,
      forceDownload = false
    } = options;

    // 기본 URL 결정
    const finalBaseUrl = baseUrl || this.bucketUrl || `${this.apiUrl}/uploads`;
    let url = `${finalBaseUrl}/${basePath}`;

    // 인증 정보 추가
    if (includeAuth) {
      const user = authService.getCurrentUser();
      if (user?.token && user?.sessionId) {
        const params = new URLSearchParams({
          token: user.token,
          sessionId: user.sessionId
        });

        if (download || forceDownload) {
          params.set('download', 'true');
        }

        // 강제 다운로드를 위한 추가 파라미터
        if (forceDownload) {
          params.set('attachment', 'true');
        }

        url += `?${params.toString()}`;
      }
    }

    return url;
  }

  /**
   * 개선된 썸네일 URL 생성
   * @param {Object|string} fileInfo - 파일 정보 또는 경로
   * @param {Object|boolean} options - 옵션 또는 preview 플래그
   * @param {string} roomId - 채팅방 ID (선택사항)
   * @returns {string} 썸네일 URL
   */
  getThumbnailUrl(fileInfo, options = {}, roomId = null) {
    // 레거시 지원: boolean을 받는 경우
    if (typeof options === 'boolean') {
      options = { preview: options };
    }

    const defaultOptions = {
      preview: true,
      width: 150,
      height: 150,
      quality: 80,
      includeAuth: true
    };

    const finalOptions = { ...defaultOptions, ...options };

    // 파일 경로 생성
    const filePath = this._buildFilePath(fileInfo, roomId);
    if (!filePath) {
      console.warn('getThumbnailUrl: Could not build file path', fileInfo);
      return '';
    }

    console.debug('getThumbnailUrl:', {
      fileInfo,
      roomId,
      filePath,
      options: finalOptions
    });

    // 인증된 URL 생성
    const url = this._buildAuthenticatedUrl(filePath, {
      includeAuth: finalOptions.includeAuth
    });

    // 이미지가 아닌 경우 원본 반환
    if (!this.isImageUrl(filePath)) {
      return url;
    }

    try {
      // S3 리사이징 서비스 사용 (있는 경우)
      if (s3Service.getResizedImageUrl && !finalOptions.preview) {
        return s3Service.getResizedImageUrl(url, {
          width: finalOptions.width,
          height: finalOptions.height,
          quality: finalOptions.quality
        });
      }

      return url;
    } catch (error) {
      console.warn('getThumbnailUrl error:', error);
      return url;
    }
  }

  /**
   * 개선된 파일 URL 생성
   * @param {Object|string} fileInfo - 파일 정보 또는 경로
   * @param {Object} options - URL 옵션
   * @param {string} roomId - 채팅방 ID (선택사항)
   * @returns {string} 파일 URL
   */
  getFileUrl(fileInfo, options = {}, roomId = null) {
    const defaultOptions = {
      download: false,
      includeAuth: true
    };

    const finalOptions = { ...defaultOptions, ...options };

    // 파일 경로 생성
    const filePath = this._buildFilePath(fileInfo, roomId);
    if (!filePath) {
      console.warn('getFileUrl: Could not build file path', fileInfo);
      return '';
    }

    console.debug('getFileUrl:', {
      fileInfo,
      roomId,
      filePath,
      options: finalOptions
    });

    return this._buildAuthenticatedUrl(filePath, finalOptions);
  }

  /**
   * 다운로드 URL 생성 (편의 메서드)
   * @param {Object|string} fileInfo - 파일 정보
   * @param {string} roomId - 채팅방 ID (선택사항)
   * @returns {string} 다운로드 URL
   */
  getDownloadUrl(fileInfo, roomId = null) {
    return this.getFileUrl(fileInfo, {
      download: true,
      includeAuth: true,
      // Content-Disposition: attachment 헤더를 위한 파라미터 추가
      forceDownload: true
    }, roomId);
  }

  /**
   * 미리보기 URL 생성 (편의 메서드)
   * @param {Object|string} fileInfo - 파일 정보
   * @param {string} roomId - 채팅방 ID (선택사항)
   * @returns {string} 미리보기 URL
   */
  getPreviewUrl(fileInfo, roomId = null) {
    return this.getFileUrl(fileInfo, { download: false }, roomId);
  }

  // 기존 메서드들은 그대로 유지...
  async validateFile(file) {
    if (!file) {
      throw new Error('파일이 선택되지 않았습니다.');
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`파일 크기는 ${this.formatFileSize(this.maxFileSize)}를 초과할 수 없습니다.`);
    }

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

  async uploadFile(file, folder = 'uploads', onProgress = null) {
    try {
      await this.validateFile(file);
      console.log(`Uploading file to S3: ${file.name} (${this.formatFileSize(file.size)})`);

      const s3Url = await s3Service.uploadFile(file, folder, onProgress);

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

  async uploadChatFile(file, chatRoomId, onProgress = null) {
    try {
      const result = await this.uploadFile(file, `chat-files/${chatRoomId}`, onProgress);
      result.chatRoomId = chatRoomId;
      result.isChatFile = true;
      return result;
    } catch (error) {
      console.error('Chat file upload error:', error);
      throw error;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileCategory(fileType) {
    if (this.allowedImageTypes.includes(fileType)) return 'image';
    if (this.allowedVideoTypes.includes(fileType)) return 'video';
    if (this.allowedAudioTypes.includes(fileType)) return 'audio';
    if (this.allowedDocumentTypes.includes(fileType)) return 'document';
    return 'unknown';
  }

  isImageUrl(url) {
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

  createPreviewUrl(file) {
    if (!file || typeof file !== 'object' || !file.type) return null;
    if (!file.type.startsWith('image/')) return null;

    try {
      return URL.createObjectURL(file);
    } catch (error) {
      console.warn('createPreviewUrl error:', error, 'file:', file);
      return null;
    }
  }

  revokePreviewUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('revokePreviewUrl error:', error, 'url:', url);
      }
    }
  }
}

const fileService = new FileService();
export default fileService;