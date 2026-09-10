import Link from "next/link";
import { kstDateString, episodeNumber, quizForDate } from "@/lib/daily";
import { answerRates } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** 어제 문제 정답 열람 (docs/02 §1-1). 플레이 불가, 열람만. */
export default async function YesterdayPage() {
  const today = kstDateString();
  const [y, m, d] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10);
  const ep = episodeNumber(yesterday);
  const items = quizForDate(yesterday);
  const rates = await answerRates(yesterday);
  const [, mm, dd] = yesterday.split("-");

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          어제의 문제,
          <br />
          정답 <em>열람</em>만 됩니다
        </h2>
        <p className="date mono">
          제{ep}호 / {Number(mm)}월 {Number(dd)}일
        </p>
        <p className="note">
          플레이는 오늘 문제만 가능합니다.
          <br />
          내일이면 오늘 문제도 이곳에 남습니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>어제의 정답 대장</small>
          </Link>
          <div className="issue mono">
            #{ep}
            <br />
            {mm}.{dd}
          </div>
        </header>

        <section className="screen">
          <h1 className="ans-title">
            어제의 10문제, <em>정답 공개</em>
          </h1>
          <ul className="answers">
            {items.map((it) => (
              <li key={it.no}>
                <span className="no mono">{String(it.no).padStart(2, "0")}</span>
                <span className="body">
                  <span className="nm">{it.kind === "real" ? it.real!.name : it.fake!.name}</span>
                  <span className="detail">
                    {it.kind === "real"
                      ? `${it.real!.sido} ${it.real!.sigungu} ${it.real!.dong} · ${it.real!.builtYear}년 준공`
                      : it.fake!.hint}
                    {rates[it.no - 1]?.rate !== null && ` · 전국 정답률 ${rates[it.no - 1].rate}%`}
                  </span>
                </span>
                <span className={`tag ${it.kind === "real" ? "" : "f"}`}>{it.kind === "real" ? "진짜" : "가짜"}</span>
              </li>
            ))}
          </ul>
          <div className="result-actions">
            <Link className="btn btn-next" href="/play">
              오늘 문제 도전하기
            </Link>
            <Link className="btn btn-ghost" href="/">
              창구로 돌아가기
            </Link>
          </div>
        </section>

        <footer className="sheet-footer">
          <span>단지 정보 출처: 공공데이터포털 K-apt</span>
          <span className="mono">매일 00:00 갱신</span>
        </footer>
      </main>
    </div>
  );
}
