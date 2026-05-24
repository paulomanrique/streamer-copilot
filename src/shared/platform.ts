/**
 * Forma comum do papel do autor da mensagem em qualquer plataforma.
 *
 * Cada adapter preenche os booleans que se aplicam à sua plataforma e usa
 * `extras` para detalhes ricos (sub tier, gift rank, anos de membership).
 * O core nunca lê de `extras` — apenas UIs específicas da plataforma fazem.
 *
 * Isto torna o contrato plug-and-play: um adapter de terceiro implementa
 * esta forma sem precisar editar tipos compartilhados.
 */
export interface PlatformRole {
  readonly broadcaster?: boolean;
  readonly moderator?: boolean;
  readonly vip?: boolean;
  readonly subscriber?: boolean;
  readonly follower?: boolean;
  /** Identificador do tier de membro (ex: '1'/'2'/'3' no Twitch, nome do nível no YouTube).
   *  Opaco para o core — só o resolver de permissões compara via catálogo ordenado. */
  readonly subscriberTier?: string;
  readonly extras?: Record<string, unknown>;
}

/**
 * Metadados ricos do evento (superchat amount, gift count, etc.).
 * `kind` é uma string livre — adapters podem cunhar tipos novos sem
 * alterar este arquivo.
 */
export interface ChatMessageMetadata {
  readonly kind: string;
  readonly [field: string]: unknown;
}
