import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Loading } from "./components/ui";
import { useAuth } from "./lib/auth";

const Landing = lazy(() => import("./landing/Landing"));
const Login = lazy(() => import("./auth/Login"));
const Console = lazy(() => import("./console/ConsoleLayout"));

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-ink-950"><Loading label="Booting OHMEN" /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/app/*"
          element={
            <RequireAuth>
              <Console />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
