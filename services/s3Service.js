// services/s3Service.js
import AWS from 'aws-sdk';

class S3Service {
    constructor() {
        this.s3 = null;
        this.bucketName = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;
        this.region = process.env.NEXT_PUBLIC_S3_REGION;

        this.initializeS3();
    }

    initializeS3() {
        // S3 클라이언트 초기화
        AWS.config.update({
            accessKeyId: process.env.NEXT_PUBLIC_S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.NEXT_PUBLIC_S3_SECRET_ACCESS_KEY,
            region: this.region,
        });

        this.s3 = new AWS.S3({
            apiVersion: '2006-03-01',
            signatureVersion: 'v4',
        });
    }

    /**
     * 파일을 S3에 업로드
     * @param {File} file - 업로드할 파일
     * @param {string} folder - S3 내 폴더 경로 (예: 'profile-images', 'chat-files')
     * @param {Function} onProgress - 업로드 진행률 콜백
     * @returns {Promise<string>} S3 파일 URL
     */
    async uploadFile(file, folder = 'uploads', onProgress = null) {
        if (!file) {
            throw new Error('업로드할 파일이 없습니다.');
        }

        // 파일 유효성 검사
        this.validateFile(file);

        // 고유한 파일명 생성
        const fileName = this.generateUniqueFileName(file.name);
        const key = `${folder}/${fileName}`;

        const uploadParams = {
            Bucket: this.bucketName,
            Key: key,
            Body: file,
            ContentType: file.type,
            Metadata: {
                originalName: file.name,
                uploadDate: new Date().toISOString(),
            }
        };

        try {
            // 업로드 진행률 추적이 필요한 경우
            if (onProgress) {
                return this.uploadWithProgress(uploadParams, onProgress);
            }

            // 기본 업로드
            const result = await this.s3.upload(uploadParams).promise();
            return result.Location;
        } catch (error) {
            console.error('S3 upload error:', error);
            throw new Error(`파일 업로드 실패: ${error.message}`);
        }
    }

    /**
     * 진행률을 추적하며 업로드
     */
    async uploadWithProgress(uploadParams, onProgress) {
        return new Promise((resolve, reject) => {
            const upload = this.s3.upload(uploadParams);

            upload.on('httpUploadProgress', (progress) => {
                const percentage = Math.round((progress.loaded / progress.total) * 100);
                onProgress(percentage);
            });

            upload.send((error, data) => {
                if (error) {
                    reject(new Error(`파일 업로드 실패: ${error.message}`));
                } else {
                    resolve(data.Location);
                }
            });
        });
    }

    /**
     * 여러 파일 동시 업로드
     * @param {File[]} files - 업로드할 파일들
     * @param {string} folder - S3 내 폴더 경로
     * @param {Function} onProgress - 전체 진행률 콜백
     * @returns {Promise<string[]>} S3 파일 URL 배열
     */
    async uploadMultipleFiles(files, folder = 'uploads', onProgress = null) {
        if (!files || files.length === 0) {
            throw new Error('업로드할 파일이 없습니다.');
        }

        const uploadPromises = files.map((file, index) => {
            return this.uploadFile(file, folder, (fileProgress) => {
                if (onProgress) {
                    // 전체 진행률 계산
                    const totalProgress = ((index * 100) + fileProgress) / files.length;
                    onProgress(Math.round(totalProgress));
                }
            });
        });

        try {
            const results = await Promise.all(uploadPromises);
            return results;
        } catch (error) {
            console.error('Multiple files upload error:', error);
            throw new Error(`파일 업로드 실패: ${error.message}`);
        }
    }

    /**
     * S3에서 파일 삭제
     * @param {string} fileUrl - 삭제할 파일의 S3 URL
     * @returns {Promise<boolean>}
     */
    async deleteFile(fileUrl) {
        try {
            const key = this.extractKeyFromUrl(fileUrl);

            const deleteParams = {
                Bucket: this.bucketName,
                Key: key,
            };

            await this.s3.deleteObject(deleteParams).promise();
            return true;
        } catch (error) {
            console.error('S3 delete error:', error);
            throw new Error(`파일 삭제 실패: ${error.message}`);
        }
    }

    /**
     * 파일 유효성 검사
     */
    validateFile(file) {
        // 파일 크기 제한 (10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error('파일 크기는 10MB를 초과할 수 없습니다.');
        }

        // 허용된 파일 타입 확인
        const allowedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/webm',
            'audio/mp3',
            'audio/wav',
            'application/pdf'
        ];

        if (!allowedTypes.includes(file.type)) {
            throw new Error('지원하지 않는 파일 형식입니다.');
        }
    }

    /**
     * 고유한 파일명 생성
     */
    generateUniqueFileName(originalName) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const extension = originalName.split('.').pop();
        return `${timestamp}-${randomString}.${extension}`;
    }

    /**
     * S3 URL에서 키 추출
     */
    extractKeyFromUrl(url) {
        const bucketUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/`;
        return url.replace(bucketUrl, '');
    }

    /**
     * Presigned URL 생성 (보안이 필요한 파일용)
     * @param {string} key - S3 객체 키
     * @param {number} expiresIn - 만료 시간 (초)
     * @returns {string} Presigned URL
     */
    getPresignedUrl(key, expiresIn = 3600) {
        const params = {
            Bucket: this.bucketName,
            Key: key,
            Expires: expiresIn,
        };

        return this.s3.getSignedUrl('getObject', params);
    }

    /**
     * 이미지 리사이징을 위한 CloudFront URL 생성 (선택사항)
     * @param {string} s3Url - 원본 S3 URL
     * @param {Object} options - 리사이징 옵션 {width, height, quality}
     * @returns {string} CloudFront URL
     */
    getResizedImageUrl(s3Url, options = {}) {
        const { width, height, quality = 80 } = options;

        // CloudFront 도메인이 설정되어 있는 경우
        if (process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN) {
            const key = this.extractKeyFromUrl(s3Url);
            let resizeParams = [];

            if (width) resizeParams.push(`w_${width}`);
            if (height) resizeParams.push(`h_${height}`);
            if (quality !== 80) resizeParams.push(`q_${quality}`);

            const transform = resizeParams.length > 0 ? `/${resizeParams.join(',')}` : '';
            return `https://${process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN}${transform}/${key}`;
        }

        // CloudFront가 없는 경우 원본 URL 반환
        return s3Url;
    }
}

// 싱글톤 인스턴스 생성
const s3Service = new S3Service();
export default s3Service;