/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

// Composables
import { createRouter, createWebHistory } from "vue-router";
import { routes } from "vue-router/auto-routes";

for (const route of routes) {
  const modals = ["/connect", "/sign", "/auth", "/network"];
  if (modals.includes(route.name!.toString())) {
    route.meta = { modal: true };
  }
}

//@ts-expect-error
routes.push(
  {
    path: "/:addr",
    component: () => import("@/components/account/Account.vue"),
    props: true,
  },
  {
    path: "/dist/main/index.html",
    component: () => import("@/pages/index.vue"),
  },
  {
    path: "/main/index.html",
    component: () => import("@/pages/index.vue"),
  }
);

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  const actions = ["connect", "sign", "auth", "swap", "network"];
  const action = to.query.action?.toString();
  if (action && actions.includes(action)) {
    delete to.query.action;
    return { path: `/${action}`, query: to.query };
  }
  if (to.path.includes("/main/index.html")) return { path: "/" };
});

export default router;
