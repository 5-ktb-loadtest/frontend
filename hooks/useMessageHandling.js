import { useCallback, useState } from 'react';
import { Toast } from '../components/Toast';
import fileService from '../services/fileService';

export const useMessageHandling = (socketRef, currentUser, router, handleSessionError, messages = []) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const handleMessageChange = useCallback((eventOrValue) => {
    let newValue;

    // ✅ 이벤트 객체인지 문자열인지 자동 판단
    if (typeof eventOrValue === 'string') {
      // ChatInput에서 직접 값을 전달한 경우
      newValue = eventOrValue;
    } else if (eventOrValue && typeof eventOrValue === 'object' && eventOrValue.target) {
      // 다른 곳에서 이벤트 객체를 전달한 경우 (역호환성)
      newValue = eventOrValue.target.value ?? '';
    } else {
      console.warn('handleMessageChange: Invalid parameter type', typeof eventOrValue, eventOrValue);
      return;
    }

    setMessage(newValue);

    // 멘션 처리
    const lines = newValue.split('\n');
    const currentLine = lines[lines.length - 1];
    const atSymbolIndex = currentLine.lastIndexOf('@');

    if (atSymbolIndex !== -1) {
      const mentionText = currentLine.slice(atSymbolIndex + 1);
      if (!mentionText.includes(' ')) {
        setMentionFilter(mentionText.toLowerCase());
        setShowMentionList(true);
        setMentionIndex(0);
        return;
      }
    }

    setShowMentionList(false);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!socketRef.current?.connected) {
      console.warn('Cannot load messages: Socket not connected');
      return;
    }

    try {
      if (loadingMessages) {
        console.log('Already loading messages, skipping...');
        return;
      }

      setLoadingMessages(true);
      const firstMessageTimestamp = messages[0]?.timestamp;

      console.log('Loading more messages:', {
        roomId: router?.query?.room,
        before: firstMessageTimestamp,
        currentMessageCount: messages.length
      });

      // Promise를 반환하도록 수정
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          setLoadingMessages(false);
          reject(new Error('Message loading timed out'));
        }, 10000);

        socketRef.current.emit('fetchPreviousMessages', {
          roomId: router?.query?.room,
          before: firstMessageTimestamp
        });

        socketRef.current.once('previousMessagesLoaded', (response) => {
          clearTimeout(timeout);
          setLoadingMessages(false);
          resolve(response);
        });

        socketRef.current.once('error', (error) => {
          clearTimeout(timeout);
          setLoadingMessages(false);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Load more messages error:', error);
      Toast.error('이전 메시지를 불러오는데 실패했습니다.');
      setLoadingMessages(false);
      throw error;
    }
  }, [socketRef, router?.query?.room, loadingMessages, messages]);

  const handleMessageSubmit = useCallback(async (messageData) => {
    if (!socketRef.current?.connected || !currentUser) {
      console.error('[Chat] Cannot send message: Socket not connected');
      Toast.error('채팅 서버와 연결이 끊어졌습니다.');
      return;
    }

    const roomId = router?.query?.room;
    if (!roomId) {
      Toast.error('채팅방 정보를 찾을 수 없습니다.');
      return;
    }

    try {
      console.log('[Chat] Sending message:', messageData);

      if (messageData.type === 'file') {
        setUploading(true);
        setUploadError(null);
        setUploadProgress(0);

        // S3에 파일 업로드 (채팅방별로 폴더 분리)
        const uploadResponse = await fileService.uploadChatFile(
          messageData.fileData.file,
          roomId,
          (progress) => setUploadProgress(progress)
        );

        console.log('[Chat] File upload response:', uploadResponse);

        // S3 업로드 응답 구조 확인 및 처리
        let fileData;

        if (uploadResponse.data?.file) {
          // 호환성 응답 구조 (이미 수정된 fileService 사용)
          fileData = {
            _id: uploadResponse.data.file._id,
            filename: uploadResponse.data.file.filename,
            originalname: uploadResponse.data.file.originalname,
            mimetype: uploadResponse.data.file.mimetype,
            size: uploadResponse.data.file.size,
            url: uploadResponse.data.file.url,
            path: uploadResponse.data.file.path
          };
        } else {
          // 기본 S3 응답 구조에서 데이터 추출
          const fileName = uploadResponse.url?.split('/').pop() || 'unknown';

          // MongoDB ObjectId 형식 생성 (24자리 16진수)
          const generateObjectId = () => {
            const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
            const randomBytes = Array.from({ length: 16 }, () =>
              Math.floor(Math.random() * 16).toString(16)
            ).join('');
            return timestamp + randomBytes;
          };

          fileData = {
            _id: generateObjectId(), // 유효한 ObjectId 형식
            filename: fileName,
            originalname: uploadResponse.originalName || messageData.fileData.name || fileName,
            mimetype: uploadResponse.type || messageData.fileData.type || 'application/octet-stream',
            size: uploadResponse.size || messageData.fileData.size || 0,
            url: uploadResponse.url,
            path: uploadResponse.url,
            // S3 특화 필드들
            key: uploadResponse.key,
            bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
            uploadedAt: uploadResponse.uploadedAt || new Date().toISOString(),
            // S3 파일임을 표시하는 플래그
            isS3File: true,
            s3Key: uploadResponse.key || `chat-files/${roomId}/${fileName}`
          };
        }

        console.log('[Chat] Processed file data:', fileData);

        // 소켓으로 파일 메시지 전송
        socketRef.current.emit('chatMessage', {
          room: roomId,
          type: 'file',
          content: messageData.content || '',
          fileData: {
            ...fileData,
            // S3 파일임을 명확히 표시
            isS3File: true,
            s3Uploaded: true,
            // 백엔드에서 파일 처리를 건너뛰도록 표시
            skipFileValidation: true,
            // 이미 업로드 완료된 파일임을 표시
            alreadyUploaded: true
          }
        });

        setFilePreview(null);
        setMessage('');
        setUploading(false);
        setUploadProgress(0);

        Toast.success('파일이 성공적으로 업로드되었습니다.');

      } else if (messageData.content?.trim()) {
        // 텍스트 메시지 전송
        socketRef.current.emit('chatMessage', {
          room: roomId,
          type: 'text',
          content: messageData.content.trim()
        });

        setMessage('');
      }

      setShowEmojiPicker(false);
      setShowMentionList(false);

    } catch (error) {
      console.error('[Chat] Message submit error:', error);

      // S3 업로드는 성공했지만 메시지 전송 실패한 경우
      if (messageData.type === 'file' && uploadResponse?.url) {
        console.warn('[Chat] File uploaded to S3 but message failed:', {
          s3Url: uploadResponse.url,
          error: error.message
        });

        Toast.error('파일은 업로드되었지만 메시지 전송에 실패했습니다. 다시 시도해주세요.');

        // 파일은 S3에 있으므로 사용자에게 URL을 알려주거나 재시도 옵션 제공
        console.log('S3 파일 URL:', uploadResponse.url);
      }

      if (error.message?.includes('세션') ||
        error.message?.includes('인증') ||
        error.message?.includes('토큰')) {
        await handleSessionError();
        return;
      }

      // 구체적인 에러 메시지 제공
      let errorMessage = '메시지 전송 중 오류가 발생했습니다.';

      if (error.message?.includes('파일을 찾을 수 없거나')) {
        errorMessage = 'S3 파일 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      } else if (error.message?.includes('권한')) {
        errorMessage = '파일 접근 권한이 없습니다. 관리자에게 문의하세요.';
      }

      Toast.error(errorMessage);

      if (messageData.type === 'file') {
        setUploadError(errorMessage);
        setUploading(false);
        setUploadProgress(0);
      }
    }
  }, [currentUser, router, handleSessionError, socketRef]);

  const handleEmojiToggle = useCallback(() => {
    setShowEmojiPicker(prev => !prev);
  }, []);

  const getFilteredParticipants = useCallback((room) => {
    if (!room?.participants) return [];

    const allParticipants = [
      {
        _id: 'wayneAI',
        name: 'wayneAI',
        email: 'ai@wayne.ai',
        isAI: true
      },
      {
        _id: 'consultingAI',
        name: 'consultingAI',
        email: 'ai@consulting.ai',
        isAI: true
      },
      ...room.participants
    ];

    return allParticipants.filter(user =>
      user.name.toLowerCase().includes(mentionFilter) ||
      user.email.toLowerCase().includes(mentionFilter)
    );
  }, [mentionFilter]);

  const insertMention = useCallback((messageInputRef, user) => {
    if (!messageInputRef?.current) return;

    const cursorPosition = messageInputRef.current.selectionStart;
    const textBeforeCursor = message.slice(0, cursorPosition);
    const atSymbolIndex = textBeforeCursor.lastIndexOf('@');

    if (atSymbolIndex !== -1) {
      const textBeforeAt = message.slice(0, atSymbolIndex);
      const newMessage =
        textBeforeAt +
        `@${user.name} ` +
        message.slice(cursorPosition);

      setMessage(newMessage);
      setShowMentionList(false);

      setTimeout(() => {
        const newPosition = atSymbolIndex + user.name.length + 2;
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(newPosition, newPosition);
      }, 0);
    }
  }, [message]);

  const removeFilePreview = useCallback(() => {
    setFilePreview(null);
    setUploadError(null);
    setUploadProgress(0);
  }, []);

  return {
    message,
    showEmojiPicker,
    showMentionList,
    mentionFilter,
    mentionIndex,
    filePreview,
    uploading,
    uploadProgress,
    uploadError,
    loadingMessages,
    setMessage,
    setShowEmojiPicker,
    setShowMentionList,
    setMentionFilter,
    setMentionIndex,
    setFilePreview,
    setLoadingMessages,
    handleMessageChange,
    handleMessageSubmit,
    handleEmojiToggle,
    handleLoadMore,
    getFilteredParticipants,
    insertMention,
    removeFilePreview
  };
};

export default useMessageHandling;