declare namespace Express {
  interface Request {
    user: { userId: string; email: string; name: string };
    token: string;
  }
}
