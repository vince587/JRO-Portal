import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { User } from "@workspace/api-client-react";
import { auth, signOut } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isError: boolean;
  logout: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  const [localUser, setLocalUser] = useState<User | null>(null);

  useEffect(() => {
    if (isError) {
      console.error("[debug] useGetMe failed:", error?.message || error);
    }
  }, [isError, error]);

  useEffect(() => {
    if (user && !isError) {
      setLocalUser(user);
    } else if (isError) {
      setLocalUser(null);
    }
  }, [user, isError]);

  const logout = () => {
    if (auth) {
      signOut(auth).catch(() => {});
    }
    setLocalUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: localUser,
        isLoading,
        isError,
        logout,
        setUser: setLocalUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
