const { ready } = require("./test-app");

describe("Authentication",()=>{
  test("rejects invalid credentials",async()=>{
    const client=await ready();
    const response=await client.post("/api/auth/login").send({
      email:"admin@alaboud.local",
      password:"wrong-password"
    });
    expect(response.status).toBe(401);
  });

  test("resets a password using a single-use expiring token",async()=>{
    const client=await ready();
    const forgot=await client.post("/api/auth/forgot-password").send({email:"admin@alaboud.local"});
    expect(forgot.status).toBe(200);
    expect(forgot.body.devResetToken).toBeTruthy();

    const nextPassword="Admin123!JestReset";
    const reset=await client.post("/api/auth/reset-password").send({
      email:"admin@alaboud.local",
      token:forgot.body.devResetToken,
      newPassword:nextPassword
    });
    expect(reset.status).toBe(200);

    const reused=await client.post("/api/auth/reset-password").send({
      email:"admin@alaboud.local",
      token:forgot.body.devResetToken,
      newPassword:"Admin123!CannotReuse"
    });
    expect(reused.status).toBe(400);

    const login=await client.post("/api/auth/login").send({email:"admin@alaboud.local",password:nextPassword});
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });
});
