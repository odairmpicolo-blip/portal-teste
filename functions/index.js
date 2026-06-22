const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const EMAIL_PROTEGIDO = "odair.marin@icloud.com";

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizarPerfil(perfil) {
  return String(perfil || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function callerEhAdministrador(email) {
  const id = normalizarEmail(email);
  if (!id) return false;
  if (id === EMAIL_PROTEGIDO) return true;

  const snap = await admin.firestore().collection("usuarios").doc(id).get();
  if (!snap.exists) return false;
  return normalizarPerfil(snap.data().perfil) === "administrador";
}

exports.excluirUsuarioPortal = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.email) {
    throw new functions.https.HttpsError("unauthenticated", "Login obrigatorio.");
  }

  const callerEmail = normalizarEmail(context.auth.token.email);
  if (!(await callerEhAdministrador(callerEmail))) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Somente administradores podem excluir usuarios."
    );
  }

  const alvo = normalizarEmail(data?.email);
  if (!alvo) {
    throw new functions.https.HttpsError("invalid-argument", "E-mail invalido.");
  }
  if (alvo === callerEmail) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Voce nao pode excluir o proprio usuario."
    );
  }
  if (alvo === EMAIL_PROTEGIDO && callerEmail !== EMAIL_PROTEGIDO) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Cadastro protegido. Apenas odair.marin@icloud.com pode excluir este usuario."
    );
  }

  let authRemovido = false;
  try {
    const user = await admin.auth().getUserByEmail(alvo);
    await admin.auth().deleteUser(user.uid);
    authRemovido = true;
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw new functions.https.HttpsError("internal", error.message || "Erro ao excluir login.");
    }
  }

  await admin.firestore().collection("usuarios").doc(alvo).delete();

  return { ok: true, email: alvo, authRemovido };
});
