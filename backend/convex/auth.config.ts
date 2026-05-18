const clerkIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!clerkIssuer) {
  throw new Error("CLERK_JWT_ISSUER_DOMAIN environment variable is required. Set it in the Convex dashboard.");
}

export default {
  providers: [
    {
      domain: clerkIssuer,
      applicationID: "convex",
    },
  ],
};
