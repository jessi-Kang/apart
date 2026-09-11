"use client";

import { useEffect } from "react";

/** 서비스 워커 등록 — 설치 요건 충족용. 실패해도 서비스에 영향 없다. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 등록 실패는 무시: 웹으로는 그대로 동작 */
      });
    }
  }, []);
  return null;
}
