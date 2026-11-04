import { ingestionBody } from "./media_pipeline.ts";

const accepted = ingestionBody.safeParse({ assetId: "asset-7", sourceUrl: "https://cdn.example.test/a.mp4", creatorId: "creator-2" });
if (!accepted.success) throw new Error("valid ingestion was rejected");
const rejected = ingestionBody.safeParse({ assetId: "", sourceUrl: "not-a-url", creatorId: "" });
if (rejected.success) throw new Error("invalid ingestion was accepted");
console.log("ingestion boundary: valid asset accepted, malformed request rejected");
