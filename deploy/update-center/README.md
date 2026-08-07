# Centro de Atualizações do FreteHub

O Centro de Atualizações permite que um usuário `ADMIN` envie um pacote oficial `.zip`, valide o manifesto e solicite a instalação sem conceder privilégios `sudo` ao processo Node.js.

## Formato do pacote

O ZIP contém somente:

- `manifest.json`
- `fretehub.bundle`

O bundle Git preserva o histórico do repositório e permite atualização offline por fast-forward.

## Segurança

- apenas ADMIN acessa a API;
- o backend não executa comandos privilegiados;
- o backend valida estrutura ZIP, versão, `targetCommit` e SHA-256;
- a solicitação é feita por arquivo em `/var/lib/fretehub/updates/install.request`;
- `fretehub-updater.path` detecta o pedido;
- `fretehub-updater.service` executa como root;
- antes do Git merge, o serviço exige working tree limpa;
- o backup `/usr/local/sbin/fretehub-backup` é obrigatório;
- o commit recebido precisa ser fast-forward do commit instalado;
- após build/publicação, API e frontend passam por health check.

## Habilitação inicial no Ubuntu

Depois que o código do Centro de Atualizações estiver implantado manualmente pela primeira vez:

```bash
cd /home/fretehubadmin/fretehub/deploy/update-center
sudo ./instalar-atualizador-ubuntu.sh
```

Esta instalação é necessária somente uma vez. As releases seguintes podem ser enviadas pela interface administrativa.
