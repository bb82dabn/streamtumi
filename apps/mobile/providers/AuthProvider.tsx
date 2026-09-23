import {
  accountDeletionRequestSchema,
  accountDeletionResponseSchema,
  authMeResponseSchema,
  authResponseSchema,
  emailVerificationRequestSchema,
  emailVerificationResendResponseSchema,
  emailVerificationResponseSchema,
  loginRequestSchema,
  mobileConfigSchema,
  mobilePasswordChangeRequestSchema,
  mobilePasswordChangeResponseSchema,
  passwordResetRequestResponseSchema,
  passwordResetRequestSchema,
  passwordResetResponseSchema,
  passwordResetSchema,
  registerRequestSchema,
  type AccountDeletionRequest,
  type AccountDeletionResponse,
  type AuthResponse,
  type EmailVerificationDelivery,
  type LoginRequest,
  type MobilePasswordChangeRequest,
  type MobileUser,
  type PasswordReset,
  type PasswordResetRequest,
  type RegisterRequest,
} from "@streamtumi/contracts";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { z } from "zod";
import {
  ApiError,
  ensureFreshMobileAccessToken,
  jsonRequest,
  refreshMobileAccessToken,
  requestJson,
  subscribeMobileAuth,
} from "@/lib/api";
import { clearAuthCredentials, getAuthCredentials, setAuthCredentials } from "@/lib/storage";

type Session = MobileUser & {
  hasBearerToken: boolean;
};

type AuthContextValue = {
  ready: boolean;
  registrationEnabled: boolean;
  session: Session | null;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<EmailVerificationDelivery>;
  requestPasswordReset: (input: PasswordResetRequest) => Promise<string>;
  resetPassword: (input: PasswordReset) => Promise<void>;
  changePassword: (input: MobilePasswordChangeRequest) => Promise<void>;
  deleteAccount: (input: AccountDeletionRequest) => Promise<AccountDeletionResponse>;
  refreshSession: () => Promise<void>;
  resendEmailVerification: () => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const okSchema = z.object({ ok: z.literal(true) });

function credentials(result: AuthResponse) {
  return {
    token: result.token,
    accessExpiresAt: result.accessExpiresAt,
    refreshToken: result.refreshToken,
    refreshExpiresAt: result.refreshExpiresAt,
  };
}

async function currentMobileUser() {
  await ensureFreshMobileAccessToken();
  try {
    return await requestJson("/api/mobile/v1/auth/me", authMeResponseSchema, { cache: "no-store" });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await refreshMobileAccessToken();
    return requestJson("/api/mobile/v1/auth/me", authMeResponseSchema, { cache: "no-store" });
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeMobileAuth((user) => {
      if (active) setSession(user ? { ...user, hasBearerToken: true } : null);
    });
    const sessionRequest = getAuthCredentials().then(async (stored) => {
      if (!stored) return null;
      try {
        return await currentMobileUser();
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await clearAuthCredentials();
        }
        return null;
      }
    });
    const configRequest = requestJson("/api/mobile/v1/config", mobileConfigSchema, { cache: "no-store" })
      .catch(() => null);
    void Promise.all([sessionRequest, configRequest]).then(([result, config]) => {
      if (!active) return;
      setSession(result ? { ...result.user, hasBearerToken: true } : null);
      setRegistrationEnabled(config?.registrationEnabled ?? false);
      setReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function login(input: LoginRequest) {
    const body = loginRequestSchema.parse(input);
    const result = await requestJson("/api/mobile/v1/auth/login", authResponseSchema, jsonRequest(body, { method: "POST" }));
    await setAuthCredentials(credentials(result));
    setSession({ ...result.user, hasBearerToken: true });
  }

  async function register(input: RegisterRequest) {
    if (!registrationEnabled) throw new Error("Registration is unavailable. Sign in with an existing account.");
    const body = registerRequestSchema.parse(input);
    const result = await requestJson("/api/mobile/v1/auth/register", authResponseSchema, jsonRequest(body, { method: "POST" }));
    await setAuthCredentials(credentials(result));
    setSession({ ...result.user, hasBearerToken: true });
    return result.verification?.delivery ?? "FAILED";
  }

  async function requestPasswordReset(input: PasswordResetRequest) {
    const body = passwordResetRequestSchema.parse(input);
    const result = await requestJson(
      "/api/mobile/v1/auth/password/forgot",
      passwordResetRequestResponseSchema,
      jsonRequest(body, { method: "POST" }),
    );
    return result.message;
  }

  async function resetPassword(input: PasswordReset) {
    const body = passwordResetSchema.parse(input);
    await requestJson(
      "/api/mobile/v1/auth/password/reset",
      passwordResetResponseSchema,
      jsonRequest(body, { method: "POST" }),
    );
    await clearAuthCredentials();
    setSession(null);
  }

  async function changePassword(input: MobilePasswordChangeRequest) {
    const body = mobilePasswordChangeRequestSchema.parse(input);
    const result = await requestJson(
      "/api/mobile/v1/account/password",
      mobilePasswordChangeResponseSchema,
      jsonRequest(body, { method: "POST" }),
    );
    await setAuthCredentials(credentials(result));
    setSession({ ...result.user, hasBearerToken: true });
  }

  async function deleteAccount(input: AccountDeletionRequest) {
    const body = accountDeletionRequestSchema.parse(input);
    const result = await requestJson(
      "/api/mobile/v1/account/delete",
      accountDeletionResponseSchema,
      jsonRequest(body, { method: "POST" }),
    );
    await clearAuthCredentials();
    setSession(null);
    return result;
  }

  async function refreshSession() {
    const result = await currentMobileUser();
    setSession({ ...result.user, hasBearerToken: true });
  }

  async function resendEmailVerification() {
    await ensureFreshMobileAccessToken();
    await requestJson(
      "/api/mobile/v1/auth/verification/resend",
      emailVerificationResendResponseSchema,
      { method: "POST" },
    );
  }

  async function verifyEmail(token: string) {
    const body = emailVerificationRequestSchema.parse({ token });
    await ensureFreshMobileAccessToken();
    await requestJson(
      "/api/mobile/v1/auth/verification/verify",
      emailVerificationResponseSchema,
      jsonRequest(body, { method: "POST" }),
    );
    await refreshSession();
  }

  async function logout() {
    try {
      const stored = await getAuthCredentials();
      if (stored) {
        await requestJson(
          "/api/mobile/v1/auth/logout",
          okSchema,
          jsonRequest({ refreshToken: stored.refreshToken }, { method: "POST" }),
        );
      }
    } finally {
      await clearAuthCredentials();
      setSession(null);
    }
  }

  return (
    <AuthContext.Provider value={{ ready, registrationEnabled, session, login, register, requestPasswordReset, resetPassword, changePassword, deleteAccount, refreshSession, resendEmailVerification, verifyEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
