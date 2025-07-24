// pages/profile.js - S3 연동 버전
import { Button, Callout, Card, Text, TextInput } from '@vapor-ui/core';
import { ErrorCircleIcon } from '@vapor-ui/icons';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProfileImageUpload from '../components/ProfileImageUpload';
import { Center, Flex, Stack } from '../components/ui/Layout';
import { withAuth } from '../middleware/withAuth';
import authService from '../services/authService';
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
  const router = useRouter();
  const avatarStyleRef = useRef(null);

  useEffect(() => {
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
  }, [router]);

  // 전역 이벤트 리스너 설정
  useEffect(() => {
    const handleProfileUpdate = () => {
      const user = authService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        setProfileImage(user.profileImage || '');
      }
    };

    window.addEventListener('userProfileUpdate', handleProfileUpdate);
    return () => {
      window.removeEventListener('userProfileUpdate', handleProfileUpdate);
    };
  }, []);

  // S3 이미지 변경 핸들러
  const handleImageChange = useCallback(async (s3ImageUrl) => {
    try {
      setError('');

      console.log('Profile image changed to:', s3ImageUrl);

      // 즉시 UI 업데이트
      setProfileImage(s3ImageUrl);

      // 현재 사용자 정보 가져오기
      const user = authService.getCurrentUser();
      if (!user) throw new Error('사용자 정보를 찾을 수 없습니다.');

      // 사용자 정보 업데이트 (S3 URL로)
      const updatedUser = {
        ...user,
        profileImage: s3ImageUrl
      };

      // localStorage 업데이트
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);

      // 백엔드 API 호출 (프로필 이미지 URL 저장)
      try {
        await authService.updateProfileImage(s3ImageUrl);
        console.log('Profile image URL saved to backend');
      } catch (apiError) {
        console.warn('Failed to save profile image URL to backend:', apiError);
        // 백엔드 실패해도 프론트엔드는 S3 URL 사용 계속
      }

      // 성공 메시지 표시
      setSuccess('프로필 이미지가 업데이트되었습니다.');

      // 3초 후 성공 메시지 제거
      setTimeout(() => {
        setSuccess('');
      }, 3000);

      // 전역 이벤트 발생
      window.dispatchEvent(new Event('userProfileUpdate'));

    } catch (error) {
      console.error('Image update error:', error);
      setError('프로필 이미지 업데이트에 실패했습니다.');

      setTimeout(() => {
        setError('');
      }, 3000);
    }
  }, []);

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

      // 성공 메시지 설정
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

  if (!currentUser) {
    return (
      <Center className="min-h-screen">
        <Text>로딩 중...</Text>
      </Center>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card className="p-8">
          <Stack spacing="lg">
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
              <ProfileImageUpload
                currentImageUrl={profileImage}
                onImageChange={handleImageChange}
                size="xl"
                userId={currentUser.id}
                allowDelete={true}
              />
            </div>

            {/* 프로필 정보 폼 */}
            <form onSubmit={handleSubmit}>
              <Stack spacing="md">
                <div>
                  <Text size="lg" weight="semibold" className="mb-4">
                    기본 정보
                  </Text>

                  <Stack spacing="sm">
                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        이메일
                      </Text>
                      <TextInput
                        value={currentUser.email}
                        disabled
                        className="bg-gray-100"
                      />
                      <Text size="xs" color="gray" className="mt-1">
                        이메일은 변경할 수 없습니다.
                      </Text>
                    </div>

                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        이름
                      </Text>
                      <TextInput
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="이름을 입력하세요"
                        disabled={loading}
                      />
                    </div>
                  </Stack>
                </div>

                {/* 비밀번호 변경 */}
                <div>
                  <Text size="lg" weight="semibold" className="mb-4">
                    비밀번호 변경
                  </Text>

                  <Stack spacing="sm">
                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        현재 비밀번호
                      </Text>
                      <TextInput
                        name="currentPassword"
                        type="password"
                        value={formData.currentPassword}
                        onChange={handleInputChange}
                        placeholder="현재 비밀번호를 입력하세요"
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        새 비밀번호
                      </Text>
                      <TextInput
                        name="newPassword"
                        type="password"
                        value={formData.newPassword}
                        onChange={handleInputChange}
                        placeholder="새 비밀번호를 입력하세요"
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <Text size="sm" weight="medium" className="mb-1">
                        새 비밀번호 확인
                      </Text>
                      <TextInput
                        name="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        placeholder="새 비밀번호를 다시 입력하세요"
                        disabled={loading}
                      />
                    </div>
                  </Stack>
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
                <Flex justify="between" align="center" className="pt-4">
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
                </Flex>
              </Stack>
            </form>
          </Stack>
        </Card>
      </div>
    </div>
  );
};

export default withAuth(Profile);