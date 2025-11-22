// platform/server/core/auth/session.js
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";

export function registerSession(app) {
  app.register(fastifyCookie);

  app.register(fastifySession, {
    secret: "0123456789ABCDEF0123456789ABCDEF", // exakt 32+ chars
    cookie: {
      secure: false,         // lokal ohne HTTPS notwendig
      httpOnly: true,
      maxAge: 1000 * 60 * 60 // 1 Stunde
    },
    saveUninitialized: false
  });
}
