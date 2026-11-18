import { useEffect } from "react";
import { Paper, Text, Title } from "@mantine/core";
import { Navigate, useLocation } from "react-router-dom";
import brandLogo from "../../../assets/brand/INKA_ATHLETICS.svg";
import { useAuthSession } from "../../../app/config/useAuthSession";
import { loginDestination } from "../../../app/routes/loginDestination";
import { LoginForm } from "../components/LoginForm";
import classes from "./login.module.css";
import { canAdminister } from "../authorization";
import { AccessDenied } from "../components/AccessDenied";

export function LoginPage() {
  const { session, view } = useAuthSession();
  const location = useLocation();
  const state: unknown = location.state;
  const from = state && typeof state === "object" && "from" in state ? state.from : undefined;
  useEffect(() => {
    const previous = document.title;
    document.title = "Iniciar sesión | Productos y Ofertas · Inka Athletics";
    return () => { document.title = previous; };
  }, []);
  if (view.user && !canAdminister(view.user)) return <AccessDenied />;
  if (view.user) return <Navigate to={loginDestination(from)} replace />;
  return (
    <main className={classes.screen}>
      <section className={classes.brandPanel} aria-label="Inka Athletics, Productos y Ofertas">
        <div className={classes.stripe} aria-hidden="true" />
        <header className={classes.brandBar}>
          <img src={brandLogo} alt="Inka Athletics" width={78} height={58} />
          <span className={classes.divider} aria-hidden="true" />
          <Text fw={600}>PRODUCTOS Y OFERTAS</Text>
        </header>
        <div className={classes.brandCopy}>
          <div className={classes.accent} aria-hidden="true" />
          <Text className={classes.eyebrow}>PLATAFORMA DE GESTIÓN</Text>
          <Title order={2} className={classes.brandTitle}>Panel de<br /><span>Administración</span></Title>
          <Text className={classes.description}>Catálogo, precios, promociones e inventario en un mismo espacio de trabajo.</Text>
        </div>
        <div className={classes.watermark} aria-hidden="true">INKA</div>
      </section>
      <section className={classes.formPanel} aria-label="Acceso">
        <Paper className={classes.card}>
          <div className={classes.accent} aria-hidden="true" />
          <Text className={classes.welcome}>BIENVENIDO DE NUEVO</Text>
          <Title order={1}>{view.mfa ? "Verificar identidad" : "Iniciar sesión"}</Title>
          <Text className={classes.intro}>{view.mfa
            ? "Confirma tu identidad con el código que recibirás por correo."
            : "Ingresa tus credenciales para acceder al panel de administración de Inka Athletics."}</Text>
          <LoginForm session={session} view={view} />
        </Paper>
        <footer className={classes.copyright}>© 2026 INKA ATHLETICS · PRODUCTOS Y OFERTAS</footer>
      </section>
    </main>
  );
}
