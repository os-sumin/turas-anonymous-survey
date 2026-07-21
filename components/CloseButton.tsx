"use client";

import { useState } from "react";

export default function CloseButton() {
  const [failed, setFailed] = useState(false);

  function handleClose() {
    window.close();
    // 스크립트로 열지 않은 창은 close()가 무시되므로 안내로 대체
    setTimeout(() => setFailed(true), 300);
  }

  if (failed) {
    return <p className="message-sub">브라우저 탭을 직접 닫아 주세요.</p>;
  }

  return (
    <button className="exit-btn" type="button" onClick={handleClose}>
      창 닫기
    </button>
  );
}
