# Movimento — GitHub Pages

Este pacote contém a versão atual do sistema gerencial e da página separada do assistente WhatsApp, pronta para hospedagem estática.

## Publicar

1. Crie um repositório público no GitHub, por exemplo `movimento`.
2. Extraia este ZIP no seu computador.
3. No repositório, abra **Add file → Upload files** e envie os arquivos extraídos. Envie o conteúdo do ZIP, não o ZIP e não uma pasta contendo os arquivos. O `index.html` deve aparecer diretamente na raiz do repositório.
4. Confirme o envio em **Commit changes** na branch `main`.
5. Abra **Settings → Pages**.
6. Em **Build and deployment**, selecione **Deploy from a branch**.
7. Selecione a branch **main** e a pasta **/(root)**. Clique em **Save**.
8. Aguarde a publicação e use o endereço exibido nessa mesma página.

Não é necessário instalar dependências, compilar o projeto ou configurar variáveis de ambiente.

## Endereços

Para um usuário `seu-usuario` e um repositório `movimento`, os endereços serão:

- Sistema gerencial: `https://seu-usuario.github.io/movimento/`
- Assistente WhatsApp: `https://seu-usuario.github.io/movimento/assistant.html`

Substitua usuário e repositório pelos seus. Os endereços acima são exemplos, não uma publicação já criada. O assistente permanece fora da navegação gerencial, conforme a proposta da interface.

## Arquivos

- `index.html`: sistema gerencial.
- `assistant.html`: assistente WhatsApp.
- `style.css` e `liquid-glass.css`: interface e tratamento visual.
- `app.js` e `liquid-glass.js`: interações e efeito de vidro.
- `.nojekyll`: publica os arquivos estáticos sem processamento por Jekyll.
- `THIRD-PARTY-NOTICES.txt`: créditos e licença da adaptação Liquid Glass.

Mantenha esses arquivos na mesma pasta. Os caminhos relativos funcionam em um repositório de projeto do GitHub Pages. Os arquivos de configuração da hospedagem anterior não são necessários e não fazem parte deste pacote.

## Limites do protótipo

Os dados são fictícios. Cada navegador armazena suas próprias alterações; os dados não são compartilhados entre computadores. Não há conexão real à API do WhatsApp nem envio de mensagens. A data de referência da demonstração é 04/11/2026. Não use a demonstração para cadastrar dados reais de pacientes.

## Como demonstrar o fluxo futuro

Sirva a pasta como site estático e abra `index.html` e `assistant.html` no mesmo endereço, em duas abas. Em **Operação do piloto**, avance o relógio em Recife para gerar lembretes e vencer ofertas antigas. A caixa **Mensagens do piloto** do assistente permite consultar mensagens e responder às ofertas.

Em **Renovações**, use o caso de Célia Almeida. Valide o relatório fictício e registre o envio pelo portal, mantendo terças e quintas às 10h. Na agenda, abra uma ocorrência futura da reserva e ofereça somente aquele dia à Beatriz Oliveira. Aceite a oferta pelo assistente. Após registrar a autorização, use **Agendar retomada** para ocupar as próximas ocorrências no horário habitual. Se Beatriz já aceitou uma data, o sistema preserva esse atendimento avulso e usa os próximos dias disponíveis para Célia.

O cenário **Primeiro atendimento** recebe pedidos de convênio e a disponibilidade do paciente. A recepção registra a guia em **Operação do piloto** e agenda o primeiro lote ao confirmar a autorização. Ao registrar sessões realizadas, o sistema acompanha a terceira e a quinta sessões. O perfil do paciente permite compartilhar links de vídeos escolhidos pelo profissional e registrar a alta após dez sessões realizadas.

O relógio, os envios e os aceites são demonstrativos. Os portais dos convênios permanecem como etapas operadas pela recepção. `pilot.js` concentra as regras e telas do fluxo futuro e reaproveita a agenda e o armazenamento local do protótipo.
