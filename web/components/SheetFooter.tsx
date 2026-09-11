import { BgmToggle } from "./BgmToggle";
import { FooterInstall } from "./FooterInstall";

/** 전 페이지 공용 푸터 — 출처와 저작자 표기만 남긴다.
 * 갱신 시각·조작 안내 같은 문구는 화면이 이미 말해주는 정보라 뺐다. */
export function SheetFooter() {
  return (
    <footer className="sheet-footer">
      <span>단지 정보 출처: 공공데이터포털 K-apt</span>
      <span className="copyright">
        © 2026 <a href="mailto:jihyun.kang@me.com">Jessi</a> ·{" "}
        <a href="https://vibelog-orcin.vercel.app/log" target="_blank" rel="noopener noreferrer">
          개발 일지
        </a>
        <BgmToggle />
        <FooterInstall />
      </span>
    </footer>
  );
}
