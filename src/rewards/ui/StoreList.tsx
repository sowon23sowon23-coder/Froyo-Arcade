'use client';

import type { GameSlug } from '@/games/registry';
import { PROMOTION, directionsUrl } from '../config';
import { track } from '../client/api';
import './rewards.css';

export function StoreList({ sourceGame }: { sourceGame?: GameSlug }) {
  const stores = PROMOTION.stores;

  return (
    <section>
      <h3 className="section-label">Participating stores</h3>
      {stores.length === 0 ? (
        <div className="card rw-empty">The list of participating stores will appear here once it&apos;s confirmed.</div>
      ) : (
        <ul className="rw-stores card">
          {stores.map((store) => (
            <li key={store.name}>
              <div>
                <b>{store.name}</b>
                <span>{store.address}</span>
                {store.hours && <span className="rw-fine">{store.hours}</span>}
              </div>
              <a
                className="btn btn-sm btn-secondary"
                href={directionsUrl(store)}
                target="_blank"
                rel="noreferrer"
                onClick={() => track('store_click', { game: sourceGame, store: store.name })}
              >
                Directions
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
