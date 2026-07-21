const { ready } = require("./test-app");

describe("Health API",()=>{
  test("returns the current release and cloud status",async()=>{
    const client=await ready();
    const response=await client.get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status:"ok",
      version:"22.1.0",
      channel:"jest-supertest-foundation",
      cloud:true
    });
  });

  test("returns JSON 404 for unknown API routes",async()=>{
    const client=await ready();
    const response=await client.get("/api/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("API route not found");
  });
});
