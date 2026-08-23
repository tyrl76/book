# 앱 링크 배포 파일

`apple-app-site-association.example`의 `APPLE_TEAM_ID`와 `assetlinks.example.json`의 인증서 SHA-256 지문을 실제 배포 값으로 바꾼다.

- iOS 파일은 확장자 없이 `https://APP_LINK_DOMAIN/.well-known/apple-app-site-association`에 배포한다.
- Android 파일은 `https://APP_LINK_DOMAIN/.well-known/assetlinks.json`에 배포한다.
- 두 응답은 리다이렉트 없이 HTTPS 200과 `application/json`으로 제공한다.
- 모바일 빌드에는 `EXPO_PUBLIC_APP_LINK_DOMAIN=APP_LINK_DOMAIN`, API에는 `PUBLIC_APP_URL=https://APP_LINK_DOMAIN`을 같은 호스트로 설정한다.

Apple Team ID와 Android 서명 인증서 지문은 개발자 계정과 최종 EAS 빌드 자격 증명이 정해진 뒤에만 확정할 수 있다.
