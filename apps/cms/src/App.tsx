import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { agentTokenApi, authApi, catalogApi, getAdminSessionToken } from "./api";
import {
  AVAILABILITY,
  CATEGORY,
  CATEGORY_LABELS,
  PUBLICATION_STATUS,
  type AgentToken,
  type CreatedAgentToken,
  type NewImage,
  type Product,
  type ProductImage,
  type ProductInput,
} from "./types";
import "./styles.css";

const EMPTY_PRODUCT: ProductInput = {
  slug: "",
  title: "",
  description: "",
  measure: "",
  price: null,
  currency: "ARS",
  category: CATEGORY.DOLLS,
  trend: false,
  availability: AVAILABILITY.MADE_TO_ORDER,
  status: PUBLICATION_STATUS.DRAFT,
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCRIPT_ID = "google-identity-services";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, options: { theme: "outline"; size: "large"; text: "signin_with"; width: number }) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const AVAILABILITY_LABELS = {
  [AVAILABILITY.AVAILABLE]: "Disponible",
  [AVAILABILITY.MADE_TO_ORDER]: "A pedido",
  [AVAILABILITY.RESERVED]: "Reservado",
  [AVAILABILITY.SOLD_OUT]: "Agotado",
};

const STATUS_LABELS = {
  [PUBLICATION_STATUS.DRAFT]: "Borrador",
  [PUBLICATION_STATUS.PUBLISHED]: "Publicado",
  [PUBLICATION_STATUS.HIDDEN]: "Oculto",
  [PUBLICATION_STATUS.DELETED]: "Eliminado",
};

function productToInput(product: Product): ProductInput {
  return {
    slug: product.slug,
    title: product.title,
    description: product.description,
    measure: product.measure,
    price: product.price,
    currency: product.currency,
    category: product.category,
    trend: product.trend,
    availability: product.availability,
    status: product.status,
  };
}

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductInput>(EMPTY_PRODUCT);
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [newImages, setNewImages] = useState<NewImage[]>([]);
  const [primarySelection, setPrimarySelection] = useState<string | null>(null);
  const [agentTokens, setAgentTokens] = useState<AgentToken[]>([]);
  const [agentTokenName, setAgentTokenName] = useState("");
  const [createdAgentToken, setCreatedAgentToken] = useState<CreatedAgentToken | null>(null);
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAdminSessionToken()));
  const [adminEmail, setAdminEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAgentToken, setSavingAgentToken] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [agentTokenError, setAgentTokenError] = useState("");

  async function loadProducts(preferredId?: string) {
    setLoading(true);
    try {
      const data = await catalogApi.list();
      setProducts(data);
      if (preferredId) {
        const refreshed = data.find((product) => product.id === preferredId) ?? null;
        if (refreshed) selectProduct(refreshed);
      }
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAgentTokens() {
    try {
      const tokens = await agentTokenApi.list();
      setAgentTokens(tokens);
      setAgentTokenError("");
    } catch (loadError) {
      setAgentTokenError(loadError instanceof Error ? loadError.message : "Could not load agent tokens.");
    }
  }

  useEffect(() => {
    if (authenticated) {
      void loadProducts();
      void loadAgentTokens();
      return;
    }
    setLoading(false);
  }, [authenticated]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || authenticated) return;
    const button = document.getElementById("google-signin-button");
    if (!button) return;
    const buttonTarget = button;

    function initializeGoogleButton() {
      window.google?.accounts?.id?.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (!response.credential) {
            setError("Google no devolvió una credencial válida.");
            return;
          }
          void signInWithGoogle(response.credential);
        },
      });
      window.google?.accounts?.id?.renderButton(buttonTarget, { theme: "outline", size: "large", text: "signin_with", width: 280 });
    }

    if (window.google?.accounts?.id) {
      initializeGoogleButton();
      return;
    }

    let script = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", initializeGoogleButton);
    return () => script?.removeEventListener("load", initializeGoogleButton);
  }, [authenticated]);

  async function signInWithGoogle(credential: string) {
    setLoading(true);
    setError("");
    try {
      const session = await authApi.signInWithGoogle(credential);
      setAdminEmail(session.email);
      setAuthenticated(true);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "No se pudo iniciar sesión con Google.");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    authApi.signOut();
    window.google?.accounts?.id?.disableAutoSelect();
    setAuthenticated(false);
    setAdminEmail("");
    setProducts([]);
    setAgentTokens([]);
    setCreatedAgentToken(null);
    startNewProduct();
  }

  function formatDate(value: string | null): string {
    return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
  }

  function tokenPreview(token: AgentToken): string {
    return `${token.token_prefix}...${token.token_last_chars}`;
  }

  async function createAgentToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentTokenName.trim()) return;
    setSavingAgentToken(true);
    setAgentTokenError("");
    try {
      const token = await agentTokenApi.create(agentTokenName);
      setCreatedAgentToken(token);
      setAgentTokenName("");
      await loadAgentTokens();
    } catch (createError) {
      setAgentTokenError(createError instanceof Error ? createError.message : "Could not create the agent token.");
    } finally {
      setSavingAgentToken(false);
    }
  }

  async function revokeAgentToken(token: AgentToken) {
    setSavingAgentToken(true);
    setAgentTokenError("");
    try {
      const revoked = await agentTokenApi.revoke(token.id);
      setAgentTokens((current) => current.map((candidate) => candidate.id === revoked.id ? revoked : candidate));
    } catch (revokeError) {
      setAgentTokenError(revokeError instanceof Error ? revokeError.message : "Could not revoke the agent token.");
    } finally {
      setSavingAgentToken(false);
    }
  }

  async function deleteAgentToken(token: AgentToken) {
    setSavingAgentToken(true);
    setAgentTokenError("");
    try {
      await agentTokenApi.delete(token.id);
      setAgentTokens((current) => current.filter((candidate) => candidate.id !== token.id));
      if (createdAgentToken?.id === token.id) setCreatedAgentToken(null);
    } catch (deleteError) {
      setAgentTokenError(deleteError instanceof Error ? deleteError.message : "Could not delete the agent token.");
    } finally {
      setSavingAgentToken(false);
    }
  }

  function clearNewImages() {
    newImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setNewImages([]);
  }

  function selectProduct(product: Product) {
    clearNewImages();
    setSelected(product);
    setForm(productToInput(product));
    setExistingImages([...product.images].sort((a, b) => a.position - b.position));
    setPrimarySelection(product.images.find((image) => image.is_primary)?.id ?? null);
    setNotice("");
    setError("");
  }

  function startNewProduct() {
    clearNewImages();
    setSelected(null);
    setForm(EMPTY_PRODUCT);
    setExistingImages([]);
    setPrimarySelection(null);
    setNotice("");
    setError("");
  }

  function updateField<Key extends keyof ProductInput>(key: Key, value: ProductInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    const additions = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      altText: form.title,
    }));
    setNewImages((current) => [...current, ...additions]);
    if (!primarySelection && additions[0]) setPrimarySelection(additions[0].id);
    event.target.value = "";
  }

  function moveNewImage(index: number, direction: -1 | 1) {
    setNewImages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function moveExistingImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!selected || target < 0 || target >= existingImages.length) return;
    const next = [...existingImages];
    [next[index], next[target]] = [next[target], next[index]];
    setSaving(true);
    try {
      const product = await catalogApi.reorderImages(selected.id, next);
      selectProduct(product);
      await loadProducts(product.id);
      setNotice("Orden actualizado.");
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "No se pudo cambiar el orden.");
    } finally {
      setSaving(false);
    }
  }

  function removeNewImage(id: string) {
    const image = newImages.find((candidate) => candidate.id === id);
    if (image) URL.revokeObjectURL(image.previewUrl);
    const remaining = newImages.filter((candidate) => candidate.id !== id);
    setNewImages(remaining);
    if (primarySelection === id) {
      setPrimarySelection(existingImages.find((candidate) => candidate.is_primary)?.id ?? remaining[0]?.id ?? null);
    }
  }

  async function removeExistingImage(image: ProductImage) {
    if (!selected || image.is_primary) return;
    setSaving(true);
    try {
      const product = await catalogApi.deleteImage(selected.id, image.id);
      selectProduct(product);
      await loadProducts(product.id);
      setNotice("Imagen eliminada.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la imagen.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const requestedStatus = form.status;
      const needsDeferredPublish = !selected && requestedStatus === PUBLICATION_STATUS.PUBLISHED;
      let product = selected
        ? await catalogApi.update(selected.id, form)
        : await catalogApi.create({ ...form, status: needsDeferredPublish ? PUBLICATION_STATUS.DRAFT : requestedStatus });

      for (const image of existingImages) {
        const current = product.images.find((candidate) => candidate.id === image.id);
        if (current && (current.alt_text !== image.alt_text || current.position !== image.position)) {
          product = await catalogApi.updateImage(product.id, image);
        }
      }

      if (newImages.length > 0) {
        const primaryIndex = newImages.findIndex((image) => image.id === primarySelection);
        product = await catalogApi.uploadImages(
          product.id,
          newImages.map((image) => image.file),
          newImages.map((image) => image.altText),
          primaryIndex >= 0 ? primaryIndex : null,
        );
      }

      const existingPrimary = product.images.find((image) => image.id === primarySelection);
      if (existingPrimary && !existingPrimary.is_primary) {
        product = await catalogApi.setPrimary(product.id, existingPrimary.id);
      }
      if (requestedStatus === PUBLICATION_STATUS.PUBLISHED && product.status !== PUBLICATION_STATUS.PUBLISHED) {
        product = await catalogApi.update(product.id, { status: PUBLICATION_STATUS.PUBLISHED });
      }

      clearNewImages();
      selectProduct(product);
      await loadProducts(product.id);
      setNotice("Producto guardado correctamente.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <main className="cms-shell auth-shell">
        <section className="auth-card">
          <span className="maker-mark" aria-hidden="true">P</span>
          <h1>Patilu CMS</h1>
          <p>Configurá <code>VITE_GOOGLE_CLIENT_ID</code> en el build del CMS para habilitar el acceso con Google.</p>
        </section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="cms-shell auth-shell">
        <section className="auth-card">
          <span className="maker-mark" aria-hidden="true">P</span>
          <h1>Patilu CMS</h1>
          <p>Ingresá con una cuenta de Google autorizada para administrar el catálogo.</p>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <div id="google-signin-button" className="google-signin-button" />
        </section>
      </main>
    );
  }

  return (
    <main className="cms-shell">
      <header className="cms-header">
        <div>
          <span className="maker-mark" aria-hidden="true">P</span>
          <div><p>Administración de catálogo</p><h1>Patilu CMS</h1></div>
        </div>
        <div className="session-actions"><p className="security-note">Acceso con Google{adminEmail ? `: ${adminEmail}` : ""}</p><button type="button" onClick={signOut}>Cerrar sesión</button></div>
      </header>

      <div className="workspace">
        <aside className="catalog-rail" aria-label="Productos">
          <div className="rail-heading"><div><span>Catálogo</span><strong>{products.length} productos</strong></div><button type="button" onClick={startNewProduct}>Nuevo</button></div>
          {loading ? <p className="state-message">Cargando productos…</p> : products.length === 0 ? <p className="state-message">Todavía no hay productos. Creá el primero.</p> : (
            <ul className="product-list">
              {products.map((product) => (
                <li key={product.id}>
                  <button className={selected?.id === product.id ? "selected" : ""} type="button" onClick={() => selectProduct(product)}>
                    {product.images.find((image) => image.is_primary) ? <img src={product.images.find((image) => image.is_primary)?.url} alt="" /> : <span className="image-placeholder">Sin foto</span>}
                    <span><strong>{product.title}</strong><small>{STATUS_LABELS[product.status]} · {AVAILABILITY_LABELS[product.availability]}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="editor" aria-labelledby="editor-title">
          <div className="editor-heading"><div><p>Ficha de producto</p><h2 id="editor-title">{selected ? `Editar ${selected.title}` : "Crear producto"}</h2></div><span className={`status-chip status-${form.status}`}>{STATUS_LABELS[form.status]}</span></div>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {notice && <p className="alert alert-success" role="status">{notice}</p>}

          <form onSubmit={saveProduct}>
            <fieldset disabled={saving}>
              <legend>Información pública</legend>
              <div className="form-grid">
                <label className="wide"><span>Título</span><input required minLength={2} value={form.title} onChange={(event) => updateField("title", event.target.value)} /></label>
                <label><span>Slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="oveja-crochet" /></label>
                <label><span>Medida</span><input required value={form.measure} onChange={(event) => updateField("measure", event.target.value)} placeholder="Aproximadamente 28 cm de alto" /></label>
                <label className="wide"><span>Descripción</span><textarea required rows={4} value={form.description} onChange={(event) => updateField("description", event.target.value)} /></label>
                <label><span>Precio</span><input type="number" min="0" step="0.01" value={form.price ?? ""} onChange={(event) => updateField("price", event.target.value || null)} placeholder="Opcional" /></label>
                <label><span>Moneda</span><select value={form.currency} onChange={(event) => updateField("currency", event.target.value)}><option value="ARS">ARS</option></select></label>
                <label><span>Categoría</span><select value={form.category} onChange={(event) => updateField("category", event.target.value as ProductInput["category"])}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="checkbox-label"><input type="checkbox" checked={form.trend} onChange={(event) => updateField("trend", event.target.checked)} /> Marcar como tendencia</label>
                <label><span>Disponibilidad</span><select value={form.availability} onChange={(event) => updateField("availability", event.target.value as ProductInput["availability"])}>{Object.entries(AVAILABILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Publicación</span><select value={form.status} onChange={(event) => updateField("status", event.target.value as ProductInput["status"])}>{Object.entries(STATUS_LABELS).filter(([value]) => value !== PUBLICATION_STATUS.DELETED).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
            </fieldset>

            <fieldset disabled={saving} className="image-fieldset">
              <legend>Fotos del producto</legend>
              <p className="field-help">JPG, PNG o WebP, hasta 8 MB cada una. La foto principal se usa en tarjetas y en la imagen grande del detalle.</p>
              <label className="file-drop"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} /><strong>Agregar fotos</strong><span>Podés seleccionar varias a la vez</span></label>
              {existingImages.length + newImages.length === 0 && <p className="empty-images">Agregá al menos una foto antes de publicar.</p>}
              <div className="image-list">
                {existingImages.map((image, index) => (
                  <article className="image-row" key={image.id}>
                    <img src={image.url} alt={image.alt_text} />
                    <div className="image-fields"><label><span>Texto alternativo</span><input value={image.alt_text} onChange={(event) => setExistingImages((current) => current.map((candidate) => candidate.id === image.id ? { ...candidate, alt_text: event.target.value } : candidate))} /></label><label className="primary-choice"><input type="radio" name="primary" checked={primarySelection === image.id} onChange={() => setPrimarySelection(image.id)} /> Foto principal</label></div>
                    <div className="image-actions"><button type="button" onClick={() => void moveExistingImage(index, -1)} disabled={index === 0} aria-label="Mover foto hacia arriba">↑</button><button type="button" onClick={() => void moveExistingImage(index, 1)} disabled={index === existingImages.length - 1} aria-label="Mover foto hacia abajo">↓</button><button type="button" className="danger" onClick={() => void removeExistingImage(image)} disabled={image.is_primary}>Eliminar</button></div>
                  </article>
                ))}
                {newImages.map((image, index) => (
                  <article className="image-row image-new" key={image.id}>
                    <div className="new-badge">Nueva</div><img src={image.previewUrl} alt="Vista previa" />
                    <div className="image-fields"><label><span>Texto alternativo</span><input value={image.altText} onChange={(event) => setNewImages((current) => current.map((candidate) => candidate.id === image.id ? { ...candidate, altText: event.target.value } : candidate))} /></label><label className="primary-choice"><input type="radio" name="primary" checked={primarySelection === image.id} onChange={() => setPrimarySelection(image.id)} /> Foto principal</label></div>
                    <div className="image-actions"><button type="button" onClick={() => moveNewImage(index, -1)} disabled={index === 0} aria-label="Mover foto nueva hacia arriba">↑</button><button type="button" onClick={() => moveNewImage(index, 1)} disabled={index === newImages.length - 1} aria-label="Mover foto nueva hacia abajo">↓</button><button type="button" className="danger" onClick={() => removeNewImage(image.id)}>Quitar</button></div>
                  </article>
                ))}
              </div>
            </fieldset>
            <div className="form-actions"><button className="save-button" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar producto"}</button><span>Los cambios publicados aparecen en la web sin reconstruir el sitio.</span></div>
          </form>
        </section>

        <section className="agent-token-panel" aria-labelledby="agent-token-title">
          <div className="editor-heading"><div><p>External agent access</p><h2 id="agent-token-title">API tokens</h2></div><span className="status-chip status-published">Admin only</span></div>
          <p className="field-help">Create tokens for external AI agents that manage product galleries through the backend API. The full token is shown once after creation.</p>
          {agentTokenError && <p className="alert alert-error" role="alert">{agentTokenError}</p>}
          {createdAgentToken && (
            <div className="created-token" role="status">
              <strong>Copy this token now</strong>
              <p>It will not be shown again. Store it in the external agent secret manager, not in frontend code.</p>
              <code>{createdAgentToken.token}</code>
            </div>
          )}
          <form className="agent-token-form" onSubmit={createAgentToken}>
            <label><span>Token name</span><input required maxLength={120} value={agentTokenName} onChange={(event) => setAgentTokenName(event.target.value)} placeholder="Gallery automation" /></label>
            <button className="save-button" type="submit" disabled={savingAgentToken || !agentTokenName.trim()}>{savingAgentToken ? "Saving..." : "Create token"}</button>
          </form>
          {agentTokens.length === 0 ? <p className="state-message">No agent tokens created yet.</p> : (
            <div className="agent-token-list">
              {agentTokens.map((token) => (
                <article className="agent-token-row" key={token.id}>
                  <div><strong>{token.name}</strong><code>{tokenPreview(token)}</code><small>Created {formatDate(token.created_at)} · Last used {formatDate(token.last_used_at)}</small></div>
                  <span className={`status-chip ${token.active ? "status-published" : "status-hidden"}`}>{token.active ? "Active" : "Revoked"}</span>
                  <div className="image-actions"><button type="button" onClick={() => void revokeAgentToken(token)} disabled={savingAgentToken || !token.active}>Revoke</button><button type="button" className="danger" onClick={() => void deleteAgentToken(token)} disabled={savingAgentToken}>Delete</button></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
