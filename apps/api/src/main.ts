import "reflect-metadata";
import { createApplication } from "./bootstrap.js";

const application = await createApplication();
await application.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
