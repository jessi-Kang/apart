"use client";

import { useEffect } from "react";
import { ensureSynced } from "@/lib/cloud";

/** 모든 페이지에서 로그인 사용자의 기록을 페이지 로드당 1회 동기화한다 */
export function CloudSync() {
  useEffect(() => {
    void ensureSynced();
  }, []);
  return null;
}
