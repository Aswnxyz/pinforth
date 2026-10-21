import { env } from "./config/env.js";
import app from "./app.js";

app.listen(env.PORT, () => {
  console.log(`Pinforth API running at http://localhost:${env.PORT}`);
});
