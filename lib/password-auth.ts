import { compare } from "bcryptjs";

const dummyPasswordHash = "$2b$12$sllFrhVFWnCqRjkH5j1BaOzARxuEyJ.9jxi6C1/2xt0NzwZhdLZha";

export async function passwordMatches(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  const matches = await compare(password, passwordHash ?? dummyPasswordHash);
  return passwordHash != null && matches;
}
