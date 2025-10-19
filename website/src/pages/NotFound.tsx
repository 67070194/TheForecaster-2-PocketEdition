import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center px-6 py-10 rounded-lg border bg-card text-card-foreground shadow-sm">
        <h1 className="mb-2 text-5xl font-bold tracking-tight">404</h1>
        <p className="mb-6 text-base text-muted-foreground">Oops! Page not found</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
