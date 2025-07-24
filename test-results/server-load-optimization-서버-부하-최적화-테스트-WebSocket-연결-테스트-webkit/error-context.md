# Page snapshot

```yaml
- img
- strong: 로그인 실패
- text: 이메일 주소가 없거나 비밀번호가 틀렸습니다.입력하신 정보를 다시 확인해주세요. 이메일
- textbox "이메일": test@example.com
- text: 비밀번호
- textbox "비밀번호": "000011"
- button "로그인"
- text: 계정이 없으신가요?
- button "회원가입"
- alert
- dialog "Unhandled Runtime Error":
  - navigation:
    - button "previous" [disabled]:
      - img "previous"
    - button "next":
      - img "next"
    - text: 1 of 2 errors Next.js (15.0.2) out of date
    - link "(learn more)":
      - /url: https://nextjs.org/docs/messages/version-staleness
  - button "Close"
  - heading "Unhandled Runtime Error" [level=1]
  - button "Copy error stack":
    - img
  - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools":
    - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
    - img
  - paragraph: "AxiosError: Request failed with status code 401"
```