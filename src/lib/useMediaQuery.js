import { useEffect, useState } from "react";

/** Live-updating match for a CSS media query.
 *
 *  Needed because a couple of behaviours (not just looks) differ by device: a
 *  phone drives navigation from the bottom bar, an iPad rotated to landscape
 *  should switch back to the wider layout mid-session, and neither can be
 *  decided once at startup. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    // addEventListener on MediaQueryList is unsupported on iOS < 14.
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
