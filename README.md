# Meu Treino

App pessoal (PWA) que recomenda rotinas de exercícios semanais, em casa (calistenia,
equipamentos de casa, pular corda) ou na academia. Leva em conta peso, altura, idade,
experiência e objetivo, começa leve para quem nunca treinou e progride semana a semana
conforme o feedback de cada treino (fácil / na medida / difícil).

Não precisa de servidor nem de conta: os dados ficam salvos só no próprio celular.

## Instalar no Android

1. No GitHub: **Settings → Pages → Source: GitHub Actions** (só na primeira vez).
2. Aguarde o workflow "Publicar no GitHub Pages" terminar (aba **Actions**).
3. Abra o link publicado no **Chrome** do celular.
4. Menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

## Rodar localmente

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

- `js/exercises.js` — banco de exercícios (adicione/edite aqui)
- `js/planner.js` — lógica que monta a semana de treinos e a progressão
- `js/app.js` — telas (perfil, semana, treino do dia)
- `sw.js` — cache para funcionar offline (mude a versão `CACHE` ao atualizar)
