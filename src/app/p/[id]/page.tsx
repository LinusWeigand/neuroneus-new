import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Workspace } from "@/components/workspace/workspace";
import { aiConfigured, builderModelId } from "@/lib/ai";
import { buildEvents, latestBuild } from "@/lib/build/engine";
import { infraConfigured } from "@/lib/build/infra";
import { authRequired } from "@/lib/auth";
import { getDecisions, getMessages, getProject, listProjects, toProjectDTO } from "@/lib/data";
import { availableModels } from "@/lib/models";

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/p/[id]">) {
  await connection();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [messages, decisions, projects, build] = await Promise.all([
    getMessages(id),
    getDecisions(id),
    listProjects(),
    latestBuild(id),
  ]);

  return (
    <Suspense>
      <Workspace
        key={project.id}
        project={toProjectDTO(project)}
        messages={messages}
        decisions={decisions}
        projects={projects}
        showSignOut={authRequired()}
        aiReady={aiConfigured()}
        build={build}
        events={build ? await buildEvents(build.id) : []}
        infraReady={infraConfigured()}
        modelInfo={{ models: availableModels(), defaultBuild: builderModelId(), fixBuild: builderModelId(null, { fixing: true }) }}
      />
    </Suspense>
  );
}
