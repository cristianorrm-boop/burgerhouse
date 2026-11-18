// Documento lido do banco, com o id do documento. Função pura (sem banco, sem DOM).

/** O id do documento vence um campo "id" gravado dentro dele (produtos da V1 têm id numérico). */
export function comId(id, dados) {
  return { ...dados, id };
}
