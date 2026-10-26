// Vigia da AmpliaHub: confere se cada site de produção responde e manda e-mail
// quando um cai e quando volta. Roda no GitHub a cada 10 minutos (.github/workflows/vigiar.yml).
//
// Site "no ar" = responde 200 em até 15 s com o conteúdo esperado
// ("versao" no JSON do /api/versao, ou "OK" no painel do Coolify).
// Pra não avisar à toa por uma falha passageira, um site só conta como fora
// depois de falhar 3 vezes seguidas, com 20 s entre as tentativas.
//
// O estado (quem está fora e desde quando) fica em estado.json, gravado pela
// rotina no próprio repositório só quando alguma coisa muda.
//
// Segredos (Settings › Secrets do repositório):
//   HOSTINGER_API_TOKEN            chave "Vigia AmpliaHub" da API de e-mail da Hostinger
//   HOSTINGER_MAILBOX_RESOURCE_ID  caixa que envia (contato@ampliahub.com.br)
//   VIGIA_DESTINOS                 quem recebe, separado por vírgula

import { readFile, writeFile } from "node:fs/promises";

const TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 20_000;
const LIMITE_MS = 15_000;

const agora = new Date();
const hora = (d) =>
  new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function duracao(desde) {
  const min = Math.round((agora - new Date(desde)) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

async function conferirUmaVez(site) {
  try {
    const resp = await fetch(site.url, { signal: AbortSignal.timeout(LIMITE_MS), redirect: "manual" });
    const texto = await resp.text();
    if (resp.status !== 200) return `respondeu ${resp.status}`;
    if (!texto.includes(site.espera)) return "respondeu 200 mas sem o conteúdo esperado";
    return null;
  } catch (e) {
    return e.name === "TimeoutError" ? `não respondeu em ${LIMITE_MS / 1000} s` : `sem conexão (${e.cause?.code ?? e.message})`;
  }
}

async function conferir(site) {
  let erro = null;
  for (let i = 1; i <= TENTATIVAS; i++) {
    erro = await conferirUmaVez(site);
    if (!erro) return null;
    if (i < TENTATIVAS) await dormir(ESPERA_ENTRE_TENTATIVAS_MS);
  }
  return erro;
}

async function enviarEmail(assunto, html) {
  const token = process.env.HOSTINGER_API_TOKEN;
  const caixa = process.env.HOSTINGER_MAILBOX_RESOURCE_ID;
  const para = (process.env.VIGIA_DESTINOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !caixa || para.length === 0) {
    throw new Error("Faltam os segredos HOSTINGER_API_TOKEN, HOSTINGER_MAILBOX_RESOURCE_ID ou VIGIA_DESTINOS.");
  }
  const resp = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${caixa}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: para, subject: assunto, html }),
  });
  if (!resp.ok) throw new Error(`A Hostinger recusou o e-mail: ${resp.status} ${await resp.text().catch(() => "")}`);
}

function corpo(linhas) {
  const itens = linhas
    .map(
      (l) => `<li style="margin-bottom:10px"><strong>${l.icone} ${l.nome}</strong><br>
      <span style="color:#5d5f66">${l.texto}</span><br>
      <a href="${l.url}" style="color:#2563eb">${l.url}</a></li>`,
    )
    .join("");
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111214">
    <div style="font-size:20px;font-weight:700;margin-bottom:12px">Vigia AmpliaHub</div>
    <ul style="padding-left:18px;font-size:14px">${itens}</ul>
    <p style="font-size:13px;color:#5d5f66;margin:16px 0 0">
      Site fora do ar costuma voltar com Restart no
      <a href="https://coolify.ampliahub.com.br" style="color:#2563eb">Coolify</a>.
      Conferido em ${hora(agora)} (horário de Brasília).
    </p>
  </div>`;
}

// Teste manual pela aba Actions: só manda um e-mail, sem conferir nada.
if (process.env.VIGIA_TESTE === "true") {
  await enviarEmail("Vigia AmpliaHub: e-mail de teste", corpo([
    { icone: "✅", nome: "Teste", texto: "Se este e-mail chegou, os avisos de site fora do ar vão chegar também.", url: "https://github.com/ampliahub/vigia" },
  ]));
  console.log("E-mail de teste enviado.");
  process.exit(0);
}

const sites = JSON.parse(await readFile("sites.json", "utf8"));
const estado = JSON.parse(await readFile("estado.json", "utf8").catch(() => "{}"));
const novoEstado = {};
const caiu = [];
const voltou = [];

const resultados = await Promise.all(sites.map(async (s) => [s, await conferir(s)]));
for (const [site, erro] of resultados) {
  const antes = estado[site.nome];
  console.log(`${erro ? "FORA" : "no ar"}  ${site.nome}${erro ? `: ${erro}` : ""}`);
  if (erro) {
    novoEstado[site.nome] = antes ?? { fora_desde: agora.toISOString(), motivo: erro };
    if (!antes) caiu.push({ icone: "🔴", nome: site.nome, url: site.url, texto: `Fora do ar: ${erro}.` });
  } else if (antes) {
    voltou.push({ icone: "🟢", nome: site.nome, url: site.url, texto: `Voltou ao ar depois de ${duracao(antes.fora_desde)} fora (desde ${hora(antes.fora_desde)}).` });
  }
}

if (caiu.length || voltou.length) {
  const partes = [];
  if (caiu.length) partes.push(`${caiu.map((l) => l.nome).join(", ")} fora do ar`);
  if (voltou.length) partes.push(`${voltou.map((l) => l.nome).join(", ")} ${voltou.length > 1 ? "voltaram" : "voltou"}`);
  // Se o e-mail falhar, o estado não é gravado: a próxima rodada tenta avisar de novo.
  await enviarEmail(`Vigia AmpliaHub: ${partes.join("; ")}`, corpo([...caiu, ...voltou]));
  console.log("Aviso enviado.");
}

const ordenado = Object.fromEntries(Object.entries(novoEstado).sort());
await writeFile("estado.json", JSON.stringify(ordenado, null, 2) + "\n");
