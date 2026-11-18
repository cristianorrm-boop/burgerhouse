# Regras do Firestore — Burger House / Cardápio Digital

Copie o bloco abaixo e cole no Console do Firebase:

**Firestore Database → Regras** → apague o conteúdo atual → cole isto → **Publicar**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /produtos/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /categorias/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /cupons/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /configuracoes/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /tiposVariacao/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /gruposAdicionais/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /vendas/{doc} {
      allow read, write: if request.auth != null;
    }

    match /mesas/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /pedidos/{doc} {
      allow read: if request.auth != null;
      allow create: if true;
      allow update, delete: if request.auth != null;
    }

    match /usuarios/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## O que essas regras fazem

- **produtos, categorias, cupons, configuracoes, tiposVariacao, gruposAdicionais, vendas**: qualquer visitante da loja pode *ler* o que precisa ser público (produtos, categorias, cupons, configurações, tipos de variação, adicionais); vendas é só pra quem está logado. Escrita em tudo isso é liberada pra **qualquer conta logada** — sem distinção de papel por enquanto.
- **mesas**: leitura pública (o cliente precisa ler o nome da mesa ao abrir o link do QR code), escrita pra qualquer conta logada.
- **pedidos**: qualquer visitante pode *criar* um pedido (é o cliente, no checkout, que grava); ler, atualizar ou excluir precisa estar logado.
- **usuarios**: cadastro dos funcionários (aba Usuários no admin). Por enquanto, leitura e escrita liberadas pra qualquer conta logada — a distinção de permissão entre "dono" e "garçom" ficou **pausada** (ver nota abaixo), então isso aqui não restringe nada ainda, só guarda o cadastro.

## Nota sobre a aba "Usuários" e permissões por papel

A ideia original era um garçom logado só ver a aba Mesas/Cozinha, sem acesso a Produtos/Configurações/Relatório/Vendas. Isso dependia de um campo de texto (`papel: "dono"`) digitado manualmente no Console do Firebase, e um espaço em branco a mais nesse campo trancou o acesso completo por engano — por segurança, decidimos **pausar essa restrição** até revisar com mais calma, pra não depender de digitação manual sensível a erro desse jeito.

O que continua funcionando normalmente:
- Cadastrar funcionários pela aba **Usuários** (nome, e-mail, senha, papel) — a conta de login é criada certinho no Firebase Authentication.
- Qualquer conta cadastrada (dono ou garçom) tem acesso completo ao admin por enquanto, igual a antes dessa funcionalidade existir.

Quando quiser retomar a restrição por papel com mais segurança (ex: preenchendo o papel por um seletor dentro do próprio admin, em vez de digitar direto no Firestore), é só avisar.

## Pré-requisito

Essas regras só funcionam depois de:
1. Criar o projeto no Firebase e preencher o `firebaseConfig` em `admin.html`.
2. Ativar **Authentication → Sign-in method → E-mail/senha**.
3. Criar o usuário admin em **Authentication → Users**.

Sem isso, `request.auth` nunca será preenchido e as escritas ficarão bloqueadas até o login por e-mail/senha estar configurado.
