import 'dotenv/config';
import service from "./backend/services/foodAnalysisService.js";

(async () => {
  const r = await service.analyzeFood("backend/uploads/1771604845464.jpg");
  console.log(JSON.stringify(r, null, 2));
})();