import { useEffect, useRef, useState } from "react";
import { Button, PasswordInput, Stack, TextInput } from "@mantine/core";
import { IconArrowRight, IconEye, IconEyeOff } from "@tabler/icons-react";
import { FeedbackAlert } from "../../../components/shared";
import type { G7Session, SessionView } from "../../promotions/adapters/g7Session";
import classes from "../pages/login.module.css";

export function LoginForm({ session, view }: { session: G7Session | null; view: SessionView }) {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const [visible, setVisible] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (view.busy) return;
    if (view.notice && view.noticeSemantic === "error") feedback.current?.focus();
    else if (view.mfa) codeInput.current?.focus();
  }, [view.mfa, view.busy, view.notice, view.noticeSemantic]);
  const disabled = !session || view.busy;
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!session || view.busy) return;
      if (view.mfa) {
        void session.verifyCode(codigo);
        setCodigo("");
      } else {
        void session.login(correo.trim(), contrasena);
        setContrasena("");
        setVisible(false);
      }
    }}>
      <Stack gap="lg" className={classes.fields}>
        {!session && <FeedbackAlert semantic="error" title="Acceso no disponible">El servicio de inicio de sesión no está configurado. No es posible acceder al panel.</FeedbackAlert>}
        {view.notice && <div ref={feedback} tabIndex={-1}><FeedbackAlert semantic={view.noticeSemantic ?? "info"} title={view.noticeSemantic === "error" ? "No se pudo completar el acceso" : "Sesión"}>{view.notice}</FeedbackAlert></div>}
        {view.mfa ? <>
          <Button variant="outline" className={classes.secondaryButton} disabled={disabled} onClick={() => { void session?.sendCode(); }}>Enviar código al correo</Button>
          <TextInput ref={codeInput} label="Código de verificación" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={codigo} onChange={event => setCodigo(event.currentTarget.value)} disabled={disabled} />
          <Button type="submit" loading={view.busy} disabled={!session}>Verificar código</Button>
          <Button variant="subtle" className={classes.secondaryButton} disabled={disabled} onClick={() => { setCodigo(""); void session?.logout(); }}>Volver al inicio de sesión</Button>
        </> : <>
          <TextInput label="Correo electrónico" type="email" name="correo" placeholder="usuario@inkaathletics.com" autoComplete="username" spellCheck={false} required value={correo} onChange={event => setCorreo(event.currentTarget.value)} disabled={disabled} />
          <PasswordInput label="Contraseña" name="contrasena" placeholder="••••••••••••" autoComplete="current-password" required value={contrasena} onChange={event => setContrasena(event.currentTarget.value)} disabled={disabled} visible={visible} onVisibilityChange={setVisible} visibilityToggleButtonProps={{ tabIndex: 0, "aria-label": visible ? "Ocultar contraseña" : "Mostrar contraseña", "aria-pressed": visible }} visibilityToggleIcon={({ reveal }) => reveal ? <IconEyeOff size={20} stroke={2} /> : <IconEye size={20} stroke={2} />} />
          <Button type="submit" fullWidth size="lg" loading={view.busy} disabled={!session} rightSection={<IconArrowRight size={20} stroke={2} aria-hidden="true" />}>Ingresar al panel</Button>
        </>}
      </Stack>
    </form>
  );
}
