import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { applyPageMeta } from "@/lib/meta";
import { metaForPath } from "@/lib/routeMeta";

/**
 * Applies the route defaults on every navigation (C-20).
 *
 * Mounted before `<Routes>` so its effect runs first; pages that call
 * `applyPageMeta` themselves override the title, description, image and robots
 * for their own route.
 */
export const RouteMeta = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    return applyPageMeta(metaForPath(pathname));
  }, [pathname]);

  return null;
};
