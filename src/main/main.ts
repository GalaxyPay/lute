import { createApp } from "vue";
import router from "@/router";
import App from "@/App.vue";
import { setupApp } from "@/ext/logic/common-setup";
import "@/styles";

const app = createApp(App);
setupApp(app);
app.use(router);

app.mount("#app");
