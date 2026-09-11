import Link from "next/link";
import { SheetFooter } from "@/components/SheetFooter";

/** 없는 주소 — 막다른 길에서도 창구로 돌아가는 문을 남긴다 */
export default function NotFound() {
  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          접수되지 않은
          <br />
          <em>서류</em>입니다
        </h2>
        <p className="note">주소를 다시 확인해 주세요.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>반려 통지</small>
          </Link>
          <div className="issue mono">404</div>
        </header>

        <section className="screen">
          <p className="center-note">
            요청하신 서류를 찾을 수 없습니다.
            <br />
            창구는 정상 운영 중입니다.
          </p>
          <div className="result-actions">
            <Link className="btn btn-next" href="/">
              창구로 돌아가기
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
