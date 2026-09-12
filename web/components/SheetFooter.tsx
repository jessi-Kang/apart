import Link from "next/link";
import { FooterInstall } from "./FooterInstall";
import { FooterShare } from "./FooterShare";

/** 전 페이지 공용 푸터 — 출처와 저작자 표기만 남긴다.
 * 갱신 시각·조작 안내 같은 문구는 화면이 이미 말해주는 정보라 뺐다.
 *
 * 표기 글은 한 덩어리로 묶고 공유 단추만 오른쪽에 따로 세운다. 형제로 나란히
 * 두면 좁은 화면에서 줄이 접힐 때 단추가 글 사이로 끼어 들어간다. */
export function SheetFooter() {
  return (
    <footer className="sheet-footer">
      <div className="foot-text">
        <span>단지 정보 출처: 공공데이터포털 K-apt</span>
        <span className="copyright">
          © 2026 <a href="mailto:jihyun.kang@me.com">Jessi</a> ·{" "}
          <a href="https://vibelog-orcin.vercel.app/log" target="_blank" rel="noopener noreferrer">
            개발 일지
          </a>{" "}
          ·{" "}
          {/* 버그를 만난 자리에서 바로 갈 수 있어야 한다. 찾아 헤매야 하면 그냥 나간다 */}
          <Link href="/bug">버그 제보</Link>
          <FooterInstall />
        </span>
      </div>
      <FooterShare />
    </footer>
  );
}
