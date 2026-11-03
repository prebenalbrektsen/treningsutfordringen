"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/", label: "Uka", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { href: "/logg", label: "Logg økt", icon: "M12 5v14M5 12h14" },
  { href: "/prat", label: "Prat", icon: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" },
  { href: "/statistikk", label: "Statistikk", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/meg", label: "Meg", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" },
];
const ADMIN = { href: "/admin", label: "Admin", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.1 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" };
const spring = { type: "spring", stiffness: 500, damping: 38 } as const;

export function NavLinks({ isAdmin, mobile, badges = {}, onStrava, avatar = null }: { isAdmin: boolean; mobile?: boolean; badges?: Record<string, number>; onStrava?: boolean; avatar?: string | null }) {
  const path = usePathname();
  // On Strava the watch logs for you, so the tab is a list of workouts, not a form.
  const base = onStrava ? LINKS.map((l) => (l.href === "/logg" ? { ...l, label: "Økter", icon: "M22 12h-4l-3 9L9 3l-3 9H2" } : l)) : LINKS;
  const links = isAdmin ? [...base, ADMIN] : base;
  // /system is part of Admin (the owner's own tab there).
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/admin" && path.startsWith("/system")));
  // Start from the server's numbers, then ask again after every page change and when the app
  // comes back, so a badge clears as soon as you've seen the thing (the layout itself doesn't re-render).
  const [counts, setCounts] = useState<Record<string, number>>(badges);
  useEffect(() => { setCounts(badges); }, [badges]);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/merker", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (b && !cancelled) setCounts(b); }).catch(() => {});
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); };
  }, [path]);
  // Tapping the tab you're already on scrolls back to the top, like iOS.
  const onTabClick = (href: string) => (e: React.MouseEvent) => {
    if (path !== href) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const listRef = useRef<HTMLUListElement | null>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    if (!mobile) return;
    const measure = () => {
      const el = items.current[links.findIndex((l) => active(l.href))];
      if (el) setLens({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, links.length, mobile]);
  // The red number on the home-screen icon: the same things the tab badges show.
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  useEffect(() => {
    if (!mobile) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (total > 0 ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(() => {});
  }, [total, mobile]);
  const badge = (href: string) =>
    counts[href] > 0 && !active(href) ? (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={spring}
        className="absolute -top-1 -right-2 min-w-4 rounded-full bg-heat px-1 text-center text-[10px] leading-4 font-bold text-white"
      >
        {counts[href] > 9 ? "9+" : counts[href]}
      </motion.span>
    ) : null;

  if (mobile) {
    // iOS-style glass tab bar: a floating, frosted pill with a lens that slides to the active tab.
    // The lens is ONE element moved sideways, measured inside the bar (offsetLeft) – shared-layout
    // animations measure against the page and fly in from below when a tab switch also scrolls.
    const activeIndex = links.findIndex((l) => active(l.href));
    return (
      <ul ref={listRef} className="glass relative flex items-stretch gap-0.5 rounded-[30px] p-1.5">
        {lens && (
          <motion.span
            aria-hidden="true"
            className="tab-lens absolute top-1.5 bottom-1.5 left-0 rounded-[24px]"
            initial={false}
            animate={{ x: lens.x, width: lens.w, opacity: activeIndex >= 0 ? 1 : 0 }}
            transition={spring}
          />
        )}
        {links.map((l, i) => (
          <li key={l.href} ref={(el) => { items.current[i] = el; }} className="relative flex-1">
            <Link href={l.href} onClick={onTabClick(l.href)} className={`relative flex flex-col items-center gap-0.5 rounded-[24px] py-1.5 text-[10.5px] font-semibold transition-colors ${active(l.href) ? "text-heat" : "text-ink/70"}`}>
              <motion.span whileTap={{ scale: 0.82 }} transition={spring} className="relative">
                {badge(l.href)}
                {l.href === "/meg" && avatar ? (
                  // Your own picture as the «Meg» icon, ringed when you're there.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className={`h-6 w-6 rounded-full object-cover ${active(l.href) ? "ring-2 ring-heat ring-offset-1 ring-offset-transparent" : ""}`} />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active(l.href) ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={l.icon} /></svg>
                )}
              </motion.span>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="glass flex gap-1 rounded-full p-1">
      {links.map((l) => (
        <li key={l.href} className="relative">
          {active(l.href) && <motion.span layoutId="top-lens" transition={spring} className="absolute inset-0 rounded-full bg-ink" />}
          <Link href={l.href} onClick={onTabClick(l.href)} className={`relative block rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${active(l.href) ? "text-paper" : "text-muted hover:text-ink"}`}>
            {l.label}{badge(l.href)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
