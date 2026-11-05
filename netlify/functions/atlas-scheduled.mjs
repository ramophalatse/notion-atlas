import {kick} from '../../lib/sync.mjs';
export default async () => {
  await kick(process.env.URL);
};
