import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');

  .sl-root {
    --ink:#0D101B;--lavender:#B3A0FF;--sky:#A0C6FF;--surface:#F8F8F8;--white:#FFF;--peach:#FDB572;--mint:#B8E5C0;--bubblegum:#F4B5D6;--sunshine:#FFC93B;--font:"Manrope","Plus Jakarta Sans",system-ui,sans-serif;
    font-family:var(--font);background:var(--surface);color:var(--ink);-webkit-font-smoothing:antialiased;line-height:1.5;overflow-x:hidden;min-height:100dvh;
  }
  .sl-root *{box-sizing:border-box;margin:0;padding:0}
  .sl-root ::selection{background:var(--lavender)}
  .sl-root svg.ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .sl-root .tnum{font-variant-numeric:tabular-nums}

  .sl-nav{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:50;background:var(--ink);color:#fff;border-radius:9999px;display:flex;align-items:center;gap:6px;padding:8px 8px 8px 22px;box-shadow:0 8px 24px rgba(13,16,27,.18)}
  .sl-nav .brand{font-weight:800;letter-spacing:-.5px;margin-right:14px;font-size:18px}
  .sl-nav a{color:rgba(255,255,255,.7);text-decoration:none;font-size:14px;font-weight:500;padding:8px 14px;border-radius:9999px;transition:.2s}.sl-nav a:hover{color:#fff}
  .sl-nav .cta{background:var(--lavender);color:var(--ink);font-weight:700}
  @media(max-width:760px){.sl-nav .links{display:none}}

  .sl-wrap{max-width:1080px;margin:0 auto;padding:0 24px}
  .sl-h1{font-size:clamp(48px,9vw,120px);font-weight:800;letter-spacing:-4px;line-height:.92}
  .sl-h2{font-size:clamp(30px,5vw,56px);font-weight:800;letter-spacing:-1.8px;line-height:1.02}
  .sl-lead{font-size:21px;color:#444b5e}.sl-muted{color:#6b7280}
  .sl-eyebrow{font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#8b8fa0}

  .sl-hero{padding:150px 0 60px}
  .sl-hero .sl-h1{max-width:900px}
  .sl-hero .sl-lead{max-width:560px;margin-top:24px}
  .sl-btn{display:inline-block;background:var(--ink);color:#fff;font-weight:800;font-size:17px;padding:16px 36px;border-radius:9999px;text-decoration:none;transition:.2s;margin-top:30px}
  .sl-btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(13,16,27,.25)}
  .sl-btn.lav{background:var(--lavender);color:var(--ink)}
  .sl-index{display:flex;flex-wrap:wrap;gap:8px;margin-top:40px}
  .sl-index a{text-decoration:none;color:var(--ink);background:#fff;border-radius:9999px;padding:9px 16px;font-weight:700;font-size:14px;box-shadow:0 4px 12px rgba(13,16,27,.05);transition:.2s}
  .sl-index a:hover{background:var(--lavender)}
  .sl-index a b{color:#b3b6c0;margin-right:6px}

  .sl-cap{padding:70px 0;border-top:2px solid rgba(13,16,27,.08)}
  .sl-caphead{display:flex;gap:24px;align-items:flex-start}
  .sl-num{font-size:clamp(40px,7vw,84px);font-weight:800;letter-spacing:-3px;color:transparent;-webkit-text-stroke:2px var(--ink);line-height:.9;flex:0 0 auto}
  .sl-caphead .t{flex:1}
  .sl-caphead .sl-h2{margin-top:4px}
  .sl-caphead p{margin-top:14px;max-width:560px}
  .sl-demo{margin-top:30px;background:#fff;border-radius:24px;padding:28px;box-shadow:0 14px 40px rgba(13,16,27,.08)}

  .sl-inbar{display:flex;align-items:center;gap:10px;background:var(--surface);border-radius:14px;padding:14px 16px;font-size:17px;min-height:58px}
  .sl-caret{display:inline-block;width:2px;height:20px;background:var(--ink);animation:sl-blink 1s steps(1) infinite}
  @keyframes sl-blink{50%{opacity:0}}
  .sl-confirm{margin-top:14px;background:var(--surface);border-radius:16px;padding:18px;opacity:0;transform:translateY(8px)}
  .sl-confirm.in{opacity:1;transform:none;transition:.5s cubic-bezier(.16,1,.3,1)}
  .sl-row{display:flex;justify-content:space-between;align-items:center}
  .sl-chk{color:#1a8a4a;font-weight:700;font-size:13px;display:flex;gap:5px;align-items:center}
  .sl-macros{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .sl-chip{border-radius:9999px;padding:8px 14px;font-weight:700;font-size:14px}
  .sl-chip.kcal{background:var(--peach)}.sl-chip.p{background:var(--mint)}.sl-chip.c{background:var(--sky)}.sl-chip.f{background:var(--bubblegum)}
  .sl-modegrid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
  @media(max-width:640px){.sl-modegrid{grid-template-columns:repeat(2,1fr)}}
  .sl-mode{background:var(--surface);border-radius:16px;padding:18px 12px;text-align:center;transition:.3s}
  .sl-mode.act{background:var(--lavender)}
  .sl-mode svg{width:26px;height:26px;color:var(--ink)}.sl-mode b{display:block;margin-top:8px;font-size:13px}
  .sl-memgrid{display:flex;flex-wrap:wrap;gap:8px}
  .sl-mem{background:#fbeff6;border:1px solid #f3cfe2;color:#b85c93;font-weight:700;font-size:14px;padding:8px 14px;border-radius:9999px;opacity:0;transform:scale(.8)}
  .sl-router{display:grid;grid-template-columns:1fr;gap:10px}
  .sl-ask{display:flex;align-items:center;gap:10px;background:var(--surface);border-radius:14px;padding:13px 15px;font-size:15px}
  .sl-spec{display:flex;align-items:center;gap:10px;background:var(--surface);border-radius:14px;padding:12px 15px}
  .sl-spec .tag{margin-left:auto;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:4px 10px;border-radius:9999px}
  .sl-styletog{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .sl-styletog button{font-family:inherit;font-weight:700;font-size:13px;border:1px solid #e3e3e8;background:#fff;color:#6b7280;padding:8px 14px;border-radius:9999px;cursor:pointer}
  .sl-styletog button.on{background:var(--mint);color:var(--ink);border-color:var(--mint)}
  .sl-insrow{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
  .sl-donut{width:150px;height:150px;position:relative;flex:0 0 150px}.sl-donut svg{transform:rotate(-90deg)}.sl-donut .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .sl-bars{display:flex;align-items:flex-end;gap:8px;height:110px;margin-top:18px}.sl-bars .b{flex:1;background:var(--lavender);border-radius:6px 6px 2px 2px;height:0}
  .sl-narr{flex:1;min-width:200px;font-size:16px;line-height:1.55}
  .sl-guide{display:grid;gap:10px}.sl-gline{display:flex;gap:10px;align-items:center;background:var(--surface);border-radius:14px;padding:13px 15px;font-weight:600}
  .sl-gline .tag{font-size:11px;font-weight:800;text-transform:uppercase;padding:4px 10px;border-radius:9999px}
  .sl-gline.do .tag{background:var(--mint)}.sl-gline.rec .tag{background:var(--sky)}.sl-gline.ig .tag{background:#e7e2db}
  .sl-streakwrap{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
  .sl-streakn{font-size:80px;font-weight:800;letter-spacing:-3px;background:linear-gradient(135deg,var(--peach),var(--sunshine));-webkit-background-clip:text;background-clip:text;color:transparent}

  .sl-section{padding:90px 0}
  .sl-cta-block{background:var(--ink);color:#fff;border-radius:32px;padding:80px 40px;text-align:center}
  .sl-reveal{opacity:0;transform:translateY(28px)}
  .sl-footer{text-align:center;padding:40px 20px 70px;color:#6b7280;font-size:13px}
  @media(prefers-reduced-motion:reduce){.sl-reveal{opacity:1;transform:none}.sl-caret{animation:none}*{scroll-behavior:auto}}
`;

export function LandingPage() {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;

    if (!reduce) document.documentElement.style.scrollBehavior = "smooth";

    Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
    ]).then(([gsapMod, stMod]) => {
      const gsap = gsapMod.gsap;
      const { ScrollTrigger } = stMod;
      gsap.registerPlugin(ScrollTrigger);

      function typeInto(el: Element | null, txt: string, sp: number, cb?: () => void) {
        if (!el) return;
        if (reduce) { el.textContent = txt; cb?.(); return; }
        let i = 0; el.textContent = "";
        const t = setInterval(() => {
          el.textContent = txt.slice(0, ++i);
          if (i >= txt.length) { clearInterval(t); cb?.(); }
        }, sp || 38);
      }

      const played: Record<string, boolean> = {};
      function runDemo(name: string) {
        if (played[name]) return; played[name] = true;
        if (name === "type") typeInto(document.getElementById("d1type"), "had a bowl of oats with banana and almonds", 42, () => document.getElementById("d1confirm")?.classList.add("in"));
        if (name === "modes") {
          let i = 0;
          const cells = [...document.querySelectorAll("#modegrid .sl-mode")];
          const cycle = () => { cells.forEach(c => c.classList.remove("act")); cells[i].classList.add("act"); i = (i + 1) % cells.length; };
          cycle();
          if (!reduce) setInterval(cycle, 1100);
        }
        if (name === "mem") {
          if (reduce) {
            document.querySelectorAll<HTMLElement>("#d3mem .sl-mem").forEach(el => { el.style.opacity = "1"; el.style.transform = "scale(1)"; });
            const count = document.getElementById("d3count"); if (count) count.textContent = "50";
            return;
          }
          gsap.to("#d3mem .sl-mem", { opacity: 1, scale: 1, duration: .4, stagger: .09, ease: "back.out(2)" });
          const o = { v: 0 };
          gsap.to(o, { v: 50, duration: 1.2, ease: "power2.out", onUpdate: () => { const el = document.getElementById("d3count"); if (el) el.textContent = String(Math.round(o.v)); } });
        }
        if (name === "ins") {
          if (reduce) {
            const kcal = document.getElementById("d5kcal"); if (kcal) kcal.textContent = "1840";
            const donut = document.getElementById("d5donut") as SVGCircleElement | null; if (donut) donut.style.strokeDashoffset = String(377 * 0.42);
            document.querySelectorAll<HTMLElement>("#d5bars .b").forEach(b => { b.style.height = b.dataset.h + "%"; });
            typeInto(document.getElementById("d5narr"), "Strong, steady day — protein gap closed and you moved well. Tomorrow, watch the weekend carb drift.", 0);
            return;
          }
          const o = { v: 0 };
          gsap.to(o, { v: 1840, duration: 1.2, ease: "power2.out", onUpdate: () => { const el = document.getElementById("d5kcal"); if (el) el.textContent = String(Math.round(o.v)); } });
          gsap.to("#d5donut", { strokeDashoffset: 377 * 0.42, duration: 1.2, ease: "power2.out" });
          document.querySelectorAll("#d5bars .b").forEach((b, j) => gsap.to(b, { height: (b as HTMLElement).dataset.h + "%", duration: .6, delay: j * .06, ease: "power3.out" }));
          typeInto(document.getElementById("d5narr"), "Strong, steady day — protein gap closed and you moved well. Tomorrow, watch the weekend carb drift.", 20);
        }
        if (name === "streak") {
          if (reduce) { const el = document.getElementById("d7streak"); if (el) el.textContent = "12"; return; }
          const o = { v: 0 };
          gsap.to(o, { v: 12, duration: 1.2, ease: "power2.out", onUpdate: () => { const el = document.getElementById("d7streak"); if (el) el.textContent = String(Math.round(o.v)); } });
        }
      }

      // coach style toggle
      const replies: Record<string, string> = {
        gentle: `"No rush — aim for ~110g today. You're halfway. Want a high-protein snack idea?"`,
        motivating: `"Let's GO — 110g target, you're at 55. One solid meal and it's yours."`,
        analytical: `"Target 110g (1.6g/kg). Currently 55g, +180 kcal vs 7-day avg. Add ~1 protein portion at dinner."`,
      };
      document.querySelectorAll("#d4tog button").forEach(b => b.addEventListener("click", () => {
        document.querySelectorAll("#d4tog button").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        const el = document.getElementById("d4reply");
        const s = (b as HTMLElement).dataset.s ?? "gentle";
        if (el) el.textContent = replies[s];
        if (!reduce) gsap.fromTo("#d4reply", { opacity: .3, y: 6 }, { opacity: 1, y: 0, duration: .4 });
      }));

      if (!reduce) {
        gsap.utils.toArray<Element>(".sl-reveal").forEach(el => gsap.to(el, { opacity: 1, y: 0, duration: .8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } }));
        document.querySelectorAll<HTMLElement>(".sl-demo").forEach(d => ScrollTrigger.create({ trigger: d, start: "top 78%", once: true, onEnter: () => runDemo(d.dataset.demo ?? "") }));
      } else {
        document.querySelectorAll(".sl-reveal").forEach(e => { (e as HTMLElement).style.opacity = "1"; (e as HTMLElement).style.transform = "none"; });
        ["type", "modes", "mem", "ins", "streak"].forEach(runDemo);
      }
    });

    return () => {
      document.documentElement.style.scrollBehavior = "";
      import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => ScrollTrigger.getAll().forEach(t => t.kill()));
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sl-root">
        <svg style={{ display: "none" }} aria-hidden="true">
          <symbol id="i-mic" viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11v1a7 7 0 0 0 14 0v-1"/><path d="M12 19v3"/></symbol>
          <symbol id="i-cam" viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></symbol>
          <symbol id="i-bar" viewBox="0 0 24 24"><path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12"/></symbol>
          <symbol id="i-ocr" viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/></symbol>
          <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z"/></symbol>
          <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></symbol>
          <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></symbol>
        </svg>

        <nav className="sl-nav">
          <img src="/stride.svg" alt="" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 7, marginRight: 2, flexShrink: 0 }} />
          <span className="brand">stride</span>
          <span className="links" style={{ display: "flex" }}>
            <a href="#caps">Capabilities</a>
            <a href="#start">Start</a>
          </span>
          <Link to="/sign-up" className="cta">Start free</Link>
        </nav>

        <div className="sl-wrap">
          <header className="sl-hero">
            <span className="sl-eyebrow">Everything Stride does</span>
            <h1 className="sl-h1">The whole stack, one routine.</h1>
            <p className="sl-lead">Stride is not a calorie tracker, a gym logger, or a dashboard. It's an adaptive AI wellness companion — here's every capability, each demonstrated live as you scroll.</p>
            <a href="#caps" className="sl-btn lav">See the stack</a>
            <div className="sl-index" id="caps">
              <a href="#c1"><b>01</b>Natural-language logging</a>
              <a href="#c2"><b>02</b>Multi-modal input</a>
              <a href="#c3"><b>03</b>Food memory</a>
              <a href="#c4"><b>04</b>AI coach &amp; routing</a>
              <a href="#c5"><b>05</b>Insights &amp; narratives</a>
              <a href="#c6"><b>06</b>Daily guidance</a>
              <a href="#c7"><b>07</b>Streak &amp; consistency</a>
            </div>
          </header>

          {/* 01 */}
          <article className="sl-cap" id="c1">
            <div className="sl-caphead sl-reveal"><div className="sl-num">01</div><div className="t"><span className="sl-eyebrow">Logging</span><h2 className="sl-h2">Type it like you'd say it.</h2><p className="sl-lead sl-muted">"Had a bowl of oats with banana and almonds." Stride extracts the meal and the macros — no database search, no portion forms.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="type">
              <div className="sl-inbar"><svg className="ic" style={{ width: 18, height: 18, color: "var(--lavender)" }}><use href="#i-chat"/></svg><span id="d1type"></span><span className="sl-caret"></span></div>
              <div className="sl-confirm" id="d1confirm"><div className="sl-row"><strong>Breakfast logged</strong><span className="sl-chk"><svg className="ic" style={{ width: 14, height: 14 }}><use href="#i-check"/></svg>confirmed</span></div><p className="sl-muted" style={{ fontSize: 14, marginTop: 4 }}>Oats, banana, almonds</p><div className="sl-macros"><span className="sl-chip kcal">410 kcal</span><span className="sl-chip p">14g protein</span><span className="sl-chip c">62g carbs</span><span className="sl-chip f">11g fat</span></div></div>
            </div>
          </article>

          {/* 02 */}
          <article className="sl-cap" id="c2">
            <div className="sl-caphead sl-reveal"><div className="sl-num">02</div><div className="t"><span className="sl-eyebrow">Five ways in</span><h2 className="sl-h2">Whatever's fastest in the moment.</h2><p className="sl-lead sl-muted">Type, speak, photograph your plate, scan a barcode, or read a nutrition label. Same result, different door.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="modes">
              <div className="sl-modegrid" id="modegrid">
                <div className="sl-mode" data-i="0"><svg className="ic"><use href="#i-chat"/></svg><b>Type</b></div>
                <div className="sl-mode" data-i="1"><svg className="ic"><use href="#i-mic"/></svg><b>Voice</b></div>
                <div className="sl-mode" data-i="2"><svg className="ic"><use href="#i-cam"/></svg><b>Photo</b></div>
                <div className="sl-mode" data-i="3"><svg className="ic"><use href="#i-bar"/></svg><b>Barcode</b></div>
                <div className="sl-mode" data-i="4"><svg className="ic"><use href="#i-ocr"/></svg><b>Label OCR</b></div>
              </div>
            </div>
          </article>

          {/* 03 */}
          <article className="sl-cap" id="c3">
            <div className="sl-caphead sl-reveal"><div className="sl-num">03</div><div className="t"><span className="sl-eyebrow">Adaptive memory</span><h2 className="sl-h2">It learns you, meal by meal.</h2><p className="sl-lead sl-muted">Every log trains Stride's food memory and custom-ingredient memory. The 20th time, your macros are already filled in.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="mem">
              <div className="sl-memgrid" id="d3mem"><span className="sl-mem">scrambled eggs · 220</span><span className="sl-mem">oat bowl · 410</span><span className="sl-mem">protein shake · 180</span><span className="sl-mem">chicken salad · 520</span><span className="sl-mem">greek yogurt · 150</span><span className="sl-mem">almond butter · 98</span><span className="sl-mem">banana · 105</span></div>
              <p className="sl-muted" style={{ marginTop: 16, fontSize: 15 }}>Accuracy compounds — <strong id="d3count" className="tnum">0</strong> foods learned and counting.</p>
            </div>
          </article>

          {/* 04 */}
          <article className="sl-cap" id="c4">
            <div className="sl-caphead sl-reveal"><div className="sl-num">04</div><div className="t"><span className="sl-eyebrow">Meet Stry</span><h2 className="sl-h2">One coach, seven specialists.</h2><p className="sl-lead sl-muted">Ask anything — Stry auto-routes to the right specialist and answers in your tone. Diet, workout, sleep, hydration, habits, mental, overall.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="coach">
              <div className="sl-ask"><svg className="ic" style={{ width: 18, height: 18, color: "var(--lavender)" }}><use href="#i-chat"/></svg>"how much protein should I get today?"</div>
              <div className="sl-spec" style={{ marginTop: 10 }}><svg className="ic" style={{ color: "var(--peach)" }}><use href="#i-spark"/></svg>Diet specialist<span className="tag" style={{ background: "var(--peach)" }}>auto-routed</span></div>
              <p id="d4reply" style={{ marginTop: 14, fontSize: 16, lineHeight: 1.55 }}>"No rush — aim for ~110g today. You're halfway. Want a high-protein snack idea?"</p>
              <div className="sl-styletog" id="d4tog"><button className="on" data-s="gentle">Gentle</button><button data-s="motivating">Motivating</button><button data-s="analytical">Analytical</button></div>
            </div>
          </article>

          {/* 05 */}
          <article className="sl-cap" id="c5">
            <div className="sl-caphead sl-reveal"><div className="sl-num">05</div><div className="t"><span className="sl-eyebrow">Insights</span><h2 className="sl-h2">Your data, written as a story.</h2><p className="sl-lead sl-muted">Macro donut, 7-day calorie history, milestones — and an AI narrative each morning, a summary each Monday.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="ins">
              <div className="sl-insrow">
                <div className="sl-donut"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="60" fill="none" stroke="#eee" strokeWidth="18"/><circle id="d5donut" cx="75" cy="75" r="60" fill="none" stroke="#B8E5C0" strokeWidth="18" strokeDasharray="377" strokeDashoffset="377" strokeLinecap="round"/></svg><div className="ctr"><b className="tnum" id="d5kcal" style={{ fontSize: 30, fontWeight: 800 }}>0</b><small className="sl-muted">kcal</small></div></div>
                <p className="sl-narr" id="d5narr"></p>
              </div>
              <div className="sl-bars" id="d5bars"><div className="b" data-h="60"></div><div className="b" data-h="82"></div><div className="b" data-h="50"></div><div className="b" data-h="90"></div><div className="b" data-h="68"></div><div className="b" data-h="86"></div><div className="b" data-h="74"></div></div>
            </div>
          </article>

          {/* 06 */}
          <article className="sl-cap" id="c6">
            <div className="sl-caphead sl-reveal"><div className="sl-num">06</div><div className="t"><span className="sl-eyebrow">Guidance over analytics</span><h2 className="sl-h2">It answers "what matters today?"</h2><p className="sl-lead sl-muted">Not a wall of numbers — one card a day telling you what to do, what to recover from, and what to ignore.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="guide">
              <div className="sl-guide">
                <div className="sl-gline do"><span className="tag">do</span>Hit 110g protein — you're halfway there.</div>
                <div className="sl-gline rec"><span className="tag">recover</span>Light legs today after yesterday's run.</div>
                <div className="sl-gline ig"><span className="tag">ignore</span>The scale this morning — it's water, not fat.</div>
              </div>
            </div>
          </article>

          {/* 07 */}
          <article className="sl-cap" id="c7">
            <div className="sl-caphead sl-reveal"><div className="sl-num">07</div><div className="t"><span className="sl-eyebrow">Behavioral sustainability</span><h2 className="sl-h2">Built for the streak, not the spreadsheet.</h2><p className="sl-lead sl-muted">Workouts parsed from a sentence, burn estimated, and a streak that rewards consistency — never punishing a missed day.</p></div></div>
            <div className="sl-demo sl-reveal" data-demo="streak">
              <div className="sl-streakwrap"><div className="sl-streakn tnum" id="d7streak">0</div><div><strong style={{ fontSize: 18 }}>day streak</strong><p className="sl-muted" style={{ fontSize: 15, marginTop: 4 }}>"Strong, steady week. The streak is the story." — Stry's weekly recap</p></div></div>
            </div>
          </article>

          <section className="sl-section"><div className="sl-cta-block sl-reveal" id="start">
            <h2 className="sl-h2" style={{ color: "#fff" }}>The whole stack. Two minutes a day.</h2>
            <p className="sl-lead" style={{ color: "rgba(255,255,255,.7)", maxWidth: 460, margin: "14px auto 26px" }}>An adaptive AI wellness companion that makes healthy routines easier to sustain.</p>
            <Link to="/sign-up" className="sl-btn lav" style={{ marginTop: 0 }}>Start free</Link>
            <p style={{ color: "rgba(255,255,255,.5)", fontSize: 13, marginTop: 24 }}>Claude Sonnet 4.6 · Groq Whisper · keys never touch your browser</p>
          </div></section>
        </div>

        <footer className="sl-footer">Stride · adaptive AI wellness companion</footer>
      </div>
    </>
  );
}
