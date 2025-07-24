// components/chat/ChatInput.js - 수정된 버전
import { Button, IconButton } from '@vapor-ui/core';
import {
  AttachFileOutlineIcon,
  LikeIcon,
  SendIcon
} from '@vapor-ui/icons';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import fileService from '../../services/fileService';
import { HStack } from '../ui/Layout';
import EmojiPicker from './EmojiPicker';
import FilePreview from './FilePreview';
import MarkdownToolbar from './MarkdownToolbar';
import MentionDropdown from './MentionDropdown';

const ChatInput = forwardRef(({
  message = '',
  onMessageChange = () => { },
  onSubmit = () => { },
  onEmojiToggle = () => { },
  onFileSelect = () => { },
  fileInputRef,
  disabled = false,
  uploading: externalUploading = false,
  showEmojiPicker = false,
  showMentionList = false,
  mentionFilter = '',
  mentionIndex = 0,
  getFilteredParticipants = () => [],
  setMessage = () => { },
  setShowEmojiPicker = () => { },
  setShowMentionList = () => { },
  setMentionFilter = () => { },
  setMentionIndex = () => { },
  room = null
}, ref) => {
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const dropZoneRef = useRef(null);
  const internalInputRef = useRef(null);
  const messageInputRef = ref || internalInputRef;
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });

  const handleFileValidationAndPreview = useCallback(async (file) => {
    if (!file) return;

    try {
      await fileService.validateFile(file);

      // 파일 프리뷰 객체 생성 - 구조를 명확히 정의
      const filePreview = {
        // 원본 File 객체
        file: file,
        // 미리보기용 blob URL
        url: URL.createObjectURL(file),
        // 파일 정보
        name: file.name,
        type: file.type,
        size: file.size,
        // 추가 메타데이터
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        uploadedAt: new Date().toISOString()
      };

      console.log('File preview created:', {
        name: filePreview.name,
        type: filePreview.type,
        size: filePreview.size,
        hasFile: !!filePreview.file,
        hasUrl: !!filePreview.url
      });

      setFiles(prev => [...prev, filePreview]);
      setUploadError(null);
      onFileSelect?.(filePreview);

    } catch (error) {
      console.error('File validation error:', error);
      setUploadError(error.message);
    } finally {
      if (fileInputRef?.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onFileSelect]);

  const handleFileRemove = useCallback((fileToRemove) => {
    setFiles(prev => prev.filter(file => file.id !== fileToRemove.id));

    // blob URL 정리
    if (fileToRemove.url && fileToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(fileToRemove.url);
    }

    setUploadError(null);
    setUploadProgress(0);
  }, []);

  const handleFileDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    try {
      await handleFileValidationAndPreview(droppedFiles[0]);
    } catch (error) {
      console.error('File drop error:', error);
    }
  }, [handleFileValidationAndPreview]);

  // 수정된 handleSubmit 함수
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();

    console.log('ChatInput handleSubmit called:', {
      filesCount: files.length,
      messageLength: message.trim().length,
      files: files.map(f => ({
        name: f.name,
        type: f.type,
        size: f.size,
        hasFile: !!f.file,
        hasUrl: !!f.url
      }))
    });

    if (files.length > 0) {
      try {
        const fileData = files[0];

        // 파일 데이터 유효성 검사 - 구조 확인
        if (!fileData) {
          throw new Error('파일 데이터가 없습니다.');
        }

        if (!fileData.file) {
          throw new Error('원본 파일 객체가 없습니다.');
        }

        console.log('Submitting file message:', {
          fileName: fileData.name,
          fileType: fileData.type,
          fileSize: fileData.size,
          messageContent: message.trim()
        });

        // 파일 메시지 전송
        onSubmit({
          type: 'file',
          content: message.trim(),
          fileData: {
            // 실제 File 객체
            file: fileData.file,
            // 파일 메타데이터
            name: fileData.name,
            type: fileData.type,
            size: fileData.size,
            url: fileData.url, // 미리보기 URL (필요한 경우)
            id: fileData.id
          }
        });

        // 전송 후 상태 초기화
        setMessage('');
        setFiles([]);

      } catch (error) {
        console.error('File submit error:', error);
        setUploadError(error.message);
      }
    } else if (message.trim()) {
      // 텍스트 메시지 전송
      console.log('Submitting text message:', message.trim());

      onSubmit({
        type: 'text',
        content: message.trim()
      });

      setMessage('');
    }
  }, [files, message, onSubmit, setMessage]);

  // 메시지 입력 핸들러
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setMessage(value);
    onMessageChange(value);

    // 멘션 기능 처리
    const lines = value.split('\n');
    const currentLine = lines[lines.length - 1];
    const mentionMatch = currentLine.match(/@(\w*)$/);

    if (mentionMatch) {
      const filter = mentionMatch[1];
      setMentionFilter(filter);
      setShowMentionList(true);
      setMentionIndex(0);

      // 멘션 드롭다운 위치 계산
      const textArea = e.target;
      const { top, left } = textArea.getBoundingClientRect();
      setMentionPosition({
        top: top - 200,
        left: left + 10
      });
    } else {
      setShowMentionList(false);
    }
  }, [setMessage, onMessageChange, setMentionFilter, setShowMentionList, setMentionIndex]);

  // 멘션 선택 핸들러
  const handleMentionSelect = useCallback((user) => {
    const lines = message.split('\n');
    const currentLine = lines[lines.length - 1];
    const mentionMatch = currentLine.match(/@(\w*)$/);

    if (mentionMatch) {
      const beforeMention = currentLine.substring(0, currentLine.lastIndexOf('@'));
      const newLine = beforeMention + `@${user.name} `;
      lines[lines.length - 1] = newLine;
      const newMessage = lines.join('\n');

      setMessage(newMessage);
      setShowMentionList(false);

      // 포커스 유지
      setTimeout(() => {
        if (messageInputRef.current) {
          messageInputRef.current.focus();
          const newCursorPos = newMessage.length;
          messageInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  }, [message, setMessage, setShowMentionList, messageInputRef]);

  // 키보드 이벤트 핸들러
  const handleKeyDown = useCallback((e) => {
    if (showMentionList) {
      const participants = getFilteredParticipants(room);
      const participantsCount = participants.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setMentionIndex(prev =>
            prev < participantsCount - 1 ? prev + 1 : 0
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setMentionIndex(prev =>
            prev > 0 ? prev - 1 : participantsCount - 1
          );
          break;

        case 'Tab':
        case 'Enter':
          e.preventDefault();
          if (participantsCount > 0) {
            handleMentionSelect(participants[mentionIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          setShowMentionList(false);
          break;

        default:
          return;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() || files.length > 0) {
        handleSubmit(e);
      }
    } else if (e.key === 'Escape' && showEmojiPicker) {
      setShowEmojiPicker(false);
    }
  }, [
    message,
    files,
    showMentionList,
    showEmojiPicker,
    mentionIndex,
    getFilteredParticipants,
    handleMentionSelect,
    handleSubmit,
    setMentionIndex,
    setShowMentionList,
    setShowEmojiPicker,
    room
  ]);

  // 마크다운 액션 핸들러
  const handleMarkdownAction = useCallback((markdown) => {
    if (!messageInputRef?.current) return;

    const input = messageInputRef.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selectedText = message.substring(start, end);
    let newText;
    let newCursorPos;
    let newSelectionStart;
    let newSelectionEnd;

    if (markdown.includes('\n')) {
      newText = message.substring(0, start) +
        markdown.replace('\n\n', '\n' + selectedText + '\n') +
        message.substring(end);
      if (selectedText) {
        newSelectionStart = start + markdown.split('\n')[0].length + 1;
        newSelectionEnd = newSelectionStart + selectedText.length;
        newCursorPos = newSelectionEnd;
      } else {
        newCursorPos = start + markdown.indexOf('\n') + 1;
        newSelectionStart = newCursorPos;
        newSelectionEnd = newCursorPos;
      }
    } else if (markdown.endsWith(' ')) {
      newText = message.substring(0, start) +
        markdown + selectedText +
        message.substring(end);
      newCursorPos = start + markdown.length + selectedText.length;
      newSelectionStart = newCursorPos;
      newSelectionEnd = newCursorPos;
    } else {
      newText = message.substring(0, start) +
        markdown + selectedText + markdown +
        message.substring(end);
      if (selectedText) {
        newSelectionStart = start + markdown.length;
        newSelectionEnd = newSelectionStart + selectedText.length;
      } else {
        newSelectionStart = start + markdown.length;
        newSelectionEnd = newSelectionStart;
      }
      newCursorPos = newSelectionEnd;
    }

    setMessage(newText);

    setTimeout(() => {
      if (messageInputRef.current) {
        input.focus();
        input.setSelectionRange(newSelectionStart, newSelectionEnd);
        if (selectedText) {
          input.setSelectionRange(newCursorPos, newCursorPos);
        }
      }
    }, 0);
  }, [message, setMessage, messageInputRef]);

  // 이모지 선택 핸들러
  const handleEmojiSelect = useCallback((emoji) => {
    if (!messageInputRef?.current) return;

    const cursorPosition = messageInputRef.current.selectionStart || message.length;
    const newMessage =
      message.slice(0, cursorPosition) +
      emoji.native +
      message.slice(cursorPosition);

    setMessage(newMessage);
    setShowEmojiPicker(false);

    setTimeout(() => {
      if (messageInputRef.current) {
        const newCursorPosition = cursorPosition + emoji.native.length;
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  }, [message, setMessage, setShowEmojiPicker, messageInputRef]);

  const toggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker(prev => !prev);
  }, [setShowEmojiPicker]);

  // 붙여넣기 이벤트 핸들러
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showEmojiPicker &&
        !emojiPickerRef.current?.contains(event.target) &&
        !emojiButtonRef.current?.contains(event.target)
      ) {
        setShowEmojiPicker(false);
      }
    };

    const handlePaste = async (event) => {
      if (!messageInputRef?.current?.contains(event.target)) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      const fileItem = Array.from(items).find(
        item => item.kind === 'file' &&
          (item.type.startsWith('image/') ||
            item.type.startsWith('video/') ||
            item.type.startsWith('audio/') ||
            item.type === 'application/pdf')
      );

      if (!fileItem) return;

      const file = fileItem.getAsFile();
      if (!file) return;

      try {
        await handleFileValidationAndPreview(file);
        event.preventDefault();
      } catch (error) {
        console.error('File paste error:', error);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('paste', handlePaste);

      // 컴포넌트 언마운트 시 blob URL 정리
      files.forEach(file => {
        if (file.url && file.url.startsWith('blob:')) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, [showEmojiPicker, messageInputRef, files, handleFileValidationAndPreview, setShowEmojiPicker]);

  const isDisabled = disabled || uploading || externalUploading;

  return (
    <>
      <div
        className={`chat-input-wrapper ${isDragging ? 'dragging' : ''}`}
        ref={dropZoneRef}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDrop={handleFileDrop}
      >
        <div className="chat-input">
          {files.length > 0 && (
            <FilePreview
              files={files}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadError={uploadError}
              onRemove={handleFileRemove}
              onRetry={() => setUploadError(null)}
              showFileName={true}
              showFileSize={true}
              variant="default"
            />
          )}

          <div className="chat-input-toolbar">
            <MarkdownToolbar
              onAction={handleMarkdownAction}
              size="md"
            />
          </div>

          <div className="chat-input-main" style={{ position: 'relative' }}>
            <textarea
              ref={messageInputRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isDragging ? "파일을 여기에 놓아주세요." : "메시지를 입력하세요..."}
              disabled={isDisabled}
              className="chat-input-field"
              rows={3}
              style={{
                width: '100%',
                resize: 'none',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'inherit',
                fontSize: '14px',
                lineHeight: '1.5'
              }}
            />

            <div className="chat-input-actions">
              <Button
                type="submit"
                size="sm"
                disabled={isDisabled || (!message.trim() && files.length === 0)}
                onClick={handleSubmit}
                className="send-button"
              >
                <SendIcon size={16} />
                전송
              </Button>
            </div>
          </div>

          <div className="chat-input-toolbar-bottom">
            <HStack spacing="sm">
              <IconButton
                ref={emojiButtonRef}
                variant="ghost"
                size="md"
                onClick={toggleEmojiPicker}
                disabled={isDisabled}
                aria-label="이모티콘"
              >
                <LikeIcon size={20} />
              </IconButton>
              <IconButton
                variant="ghost"
                size="md"
                onClick={() => fileInputRef?.current?.click()}
                disabled={isDisabled}
                aria-label="파일 첨부"
              >
                <AttachFileOutlineIcon size={20} />
              </IconButton>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFileValidationAndPreview(e.target.files?.[0])}
                style={{ display: 'none' }}
                accept="image/*,video/*,audio/*,application/pdf"
              />
            </HStack>
          </div>

          {showEmojiPicker && (
            <div className="emoji-picker-container" ref={emojiPickerRef}>
              <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            </div>
          )}
        </div>
      </div>

      {showMentionList && (
        <div
          style={{
            position: 'fixed',
            top: `${mentionPosition.top}px`,
            left: `${mentionPosition.left}px`,
            zIndex: 9999
          }}
        >
          <MentionDropdown
            participants={getFilteredParticipants(room)}
            activeIndex={mentionIndex}
            onSelect={handleMentionSelect}
            onMouseEnter={(index) => setMentionIndex(index)}
          />
        </div>
      )}
    </>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;