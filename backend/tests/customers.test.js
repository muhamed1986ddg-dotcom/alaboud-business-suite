const { ready, login } = require("./test-app");

describe("Customers API",()=>{
  test("requires authentication",async()=>{
    const client=await ready();
    const response=await client.get("/api/customers");
    expect(response.status).toBe(401);
  });

  test("creates and retrieves a customer",async()=>{
    const client=await ready();
    const token=await login();
    const created=await client.post("/api/customers")
      .set("Authorization",`Bearer ${token}`)
      .send({name:"عميل Jest",phone:"15195550123"});
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list=await client.get("/api/customers").set("Authorization",`Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some(item=>item.id===created.body.id)).toBe(true);
  });
});
