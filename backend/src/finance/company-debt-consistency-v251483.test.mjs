import test from "node:test";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);

test("legacy v25.14.83 company-debt regression delegates to the canonical v25.14.84 model",()=>{
  require("../company-debt-consistency-v251484.test.js");
});
