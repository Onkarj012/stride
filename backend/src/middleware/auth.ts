import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";

type LocalUser = { id: string; email: string; name: string };

class ProvisioningError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const getLinkedUser = db.prepare(`
  SELECT users.id, users.email, users.name
  FROM auth_identities
  JOIN users ON users.id = auth_identities.user_id
  WHERE auth_identities.provider = 'clerk'
    AND auth_identities.provider_user_id = ?
`);
const getUserById = db.prepare("SELECT id, email, name FROM users WHERE id = ?");
const getUsersByEmail = db.prepare(
  "SELECT id, email, name FROM users WHERE lower(email) = lower(?)",
);
const getIdentityForUser = db.prepare(`
  SELECT provider_user_id
  FROM auth_identities
  WHERE provider = 'clerk' AND user_id = ?
`);
const insertIdentity = db.prepare(`
  INSERT INTO auth_identities (provider, provider_user_id, user_id)
  VALUES ('clerk', ?, ?)
`);
const insertUser = db.prepare(`
  INSERT INTO users (id, email, name, password_hash)
  VALUES (?, ?, ?, ?)
`);

function linkIdentity(clerkUserId: string, user: LocalUser): LocalUser {
  const existingIdentity = getIdentityForUser.get(user.id) as
    | { provider_user_id: string }
    | undefined;
  if (existingIdentity && existingIdentity.provider_user_id !== clerkUserId) {
    throw new ProvisioningError("Local account is already linked to another Clerk user", 409);
  }
  if (!existingIdentity) {
    insertIdentity.run(clerkUserId, user.id);
  }
  return user;
}

const provisionUser = db.transaction(
  (clerkUserId: string, email: string, name: string): LocalUser => {
    const linked = getLinkedUser.get(clerkUserId) as LocalUser | undefined;
    if (linked) return linked;

    const currentClerkIdUser = getUserById.get(clerkUserId) as LocalUser | undefined;
    if (currentClerkIdUser) {
      return linkIdentity(clerkUserId, currentClerkIdUser);
    }

    const emailMatches = getUsersByEmail.all(email) as LocalUser[];
    if (emailMatches.length > 1) {
      throw new ProvisioningError("Multiple local accounts use this email", 409);
    }
    if (emailMatches.length === 1) {
      return linkIdentity(clerkUserId, emailMatches[0]);
    }

    const user: LocalUser = { id: uuidv4(), email, name };
    insertUser.run(user.id, user.email, user.name, `clerk-only:${uuidv4()}`);
    insertIdentity.run(clerkUserId, user.id);
    return user;
  },
);

export async function ensureUser(req: Request, res: Response, next: NextFunction) {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) {
    next();
    return;
  }

  const linked = getLinkedUser.get(clerkUserId) as LocalUser | undefined;
  if (linked) {
    req.user = { userId: linked.id, name: linked.name, email: linked.email };
    next();
    return;
  }

  const currentClerkIdUser = getUserById.get(clerkUserId) as LocalUser | undefined;
  if (currentClerkIdUser) {
    try {
      const user = provisionUser.immediate(
        clerkUserId,
        currentClerkIdUser.email,
        currentClerkIdUser.name,
      );
      req.user = { userId: user.id, name: user.name, email: user.email };
      next();
    } catch (err) {
      if (err instanceof ProvisioningError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Local user identity linking failed:", err);
      res.status(500).json({ error: "Unable to link local account" });
    }
    return;
  }

  let clerkUser;
  try {
    clerkUser = await clerkClient.users.getUser(clerkUserId);
  } catch (err) {
    console.error("Clerk user lookup failed:", err);
    res.status(503).json({ error: "Unable to verify account details" });
    return;
  }

  const primaryEmail = clerkUser.emailAddresses.find(
    (candidate) => candidate.id === clerkUser.primaryEmailAddressId,
  );
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    res.status(409).json({ error: "A verified primary email is required" });
    return;
  }

  const email = primaryEmail.emailAddress.trim().toLowerCase();
  if (!email) {
    res.status(409).json({ error: "A verified primary email is required" });
    return;
  }

  const name =
    `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "Athlete";

  try {
    const user = provisionUser.immediate(clerkUserId, email, name);
    req.user = { userId: user.id, name: user.name, email: user.email };
    next();
  } catch (err) {
    if (err instanceof ProvisioningError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("Local user provisioning failed:", err);
    res.status(500).json({ error: "Unable to provision local account" });
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!req.user) {
    res.status(500).json({ error: "Local account is unavailable" });
    return;
  }
  next();
}
