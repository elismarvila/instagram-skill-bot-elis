/**
 * Instagram Comment → DM Bot
 * Quando alguém comenta "skill" no post, recebe uma DM com o link automaticamente.
 */

const SKILLS_LINK = process.env.SKILLS_LINK;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const TARGET_POST_ID = process.env.TARGET_POST_ID; // opcional: filtrar por post específico

// Evita enviar DM duplicada para o mesmo usuário (em memória, reset a cada cold start)
const sentTo = new Set();

export default async function handler(req, res) {
  // ── GET: verificação do webhook pela Meta ──────────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('[webhook] Verificação aprovada');
      return res.status(200).send(challenge);
    }

    console.warn('[webhook] Verificação recusada — token inválido');
    return res.status(403).json({ error: 'Token inválido' });
  }

  // ── POST: eventos do Instagram ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;

    if (body.object !== 'instagram') {
      return res.status(200).json({ status: 'ignored' });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {

        if (change.field !== 'comments') continue;

        const { text, from, media } = change.value ?? {};

        // Filtra por post específico (se TARGET_POST_ID estiver definido)
        if (TARGET_POST_ID && media?.id !== TARGET_POST_ID) continue;

        // Verifica se o comentário contém "skill" (case-insensitive)
        if (!text?.toLowerCase().includes('skill')) continue;

        const userId = from?.id;
        if (!userId) continue;

        // Evita DM duplicada na mesma sessão
        if (sentTo.has(userId)) {
          console.log(`[webhook] DM já enviada para ${userId}, pulando`);
          continue;
        }

        console.log(`[webhook] Comentário "skill" detectado de ${userId} — enviando DM`);

        const success = await sendDM(userId);

        if (success) {
          sentTo.add(userId);
          console.log(`[webhook] DM enviada com sucesso para ${userId}`);
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

// ─── Envia DM via Instagram Graph API ────────────────────────────────────────
async function sendDM(recipientId) {
  const message = `Olá! Aqui está o link com as skills do Claude que compartilhei: ${SKILLS_LINK} 🚀`;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${IG_USER_ID}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient:    { id: recipientId },
          message:      { text: message },
          access_token: META_ACCESS_TOKEN,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[sendDM] Erro da API Meta:', JSON.stringify(data));
      return false;
    }

    return true;
  } catch (err) {
    console.error('[sendDM] Erro inesperado:', err.message);
    return false;
  }
}
